import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { StageLink } from '../../shared/stage-link.js';
import { eligible, initialState, type Plan, type StageEvent, stages, type StageState, step, type World } from './logic/stages.js';
import { Strip, type StripStage } from './strip.js';

type Signals = { connect(signal: string, callback: (...args: never[]) => unknown): number; disconnect(id: number): void };
/** `skipNextEffect` is public in GNOME 46 but has no typing. */
type WindowManager = { skipNextEffect(actor: Meta.WindowActor): void };

/** Events that only ask to settle again: one in the queue is enough. */
const COALESCED = new Set<StageEvent['type']>(['focus', 'workspace']);

/**
 * macOS Stage Manager: the focused app's windows stay where they are, and
 * every other app's windows on the primary monitor are minimized (without
 * an animation) and shown as stages in a strip on the left. Clicking a stage,
 * or reaching one of its windows any other way (dock, Alt+Tab, Mission
 * Control), swaps it into the middle. Decisions are `logic/stages.ts`; this
 * class feeds it the shell's events and carries out its plans.
 */
export class StageManager implements StageLink {
    private readonly tracker = Shell.WindowTracker.get_default();
    private readonly strip: Strip;
    private readonly ids: [Signals, number][] = [];
    /** Every window seen, with its own signal handlers. */
    private readonly windows = new Map<number, { window: Meta.Window; ids: number[] }>();
    /** Windows that have shown at least once. */
    private readonly ready = new Set<number>();
    private state: StageState = initialState();
    private queue: StageEvent[] = [];
    private later = 0;
    /** Set while Stage Manager itself minimizes and unminimizes. */
    private applying = false;
    private pauses = 0;
    private locked = false;

    constructor() {
        this.strip = new Strip((app) => this.push({ type: 'select', app }));
        for (const actor of global.get_window_actors()) {
            this.track(actor.meta_window);
            this.ready.add(actor.meta_window.get_id());
        }
        this.listen(global.display, 'window-created', (_display: unknown, window: Meta.Window) => this.onCreated(window));
        this.listen(global.display, 'notify::focus-window', () => this.push({ type: 'focus' }));
        this.listen(global.display, 'window-entered-monitor', () => this.push({ type: 'workspace' }));
        this.listen(global.display, 'window-left-monitor', () => this.push({ type: 'workspace' }));
        this.listen(global.workspace_manager, 'active-workspace-changed', () => this.push({ type: 'workspace' }));
        this.listen(Main.layoutManager, 'monitors-changed', () => this.push({ type: 'workspace' }));
        // Mission Control shows every window; act on what was picked once it closes.
        this.listen(Main.overview, 'hidden', () => this.schedule());
        this.listen(Main.sessionMode, 'updated', () => this.syncLock());
        this.run({ type: 'enable' });
        this.syncLock();
        this.refresh();
    }

    destroy(): void {
        if (this.later) global.compositor.get_laters().remove(this.later);
        this.later = 0;
        this.queue = [];
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        // Everything it minimized comes back where it was, oldest first.
        this.run({ type: 'disable' });
        for (const { window, ids } of this.windows.values()) for (const id of ids) window.disconnect(id);
        this.windows.clear();
        this.ready.clear();
        this.strip.destroy();
    }

    pause(): void {
        this.pauses++;
        if (this.pauses > 1) return;
        // What happened before the pause still counts.
        if (this.queue.length > 0 && !Main.overview.visible) this.flush();
        this.run({ type: 'pause' });
    }

    resume(): void {
        if (this.pauses === 0) return;
        this.pauses--;
        // After the minimizes and focus changes made while paused have come in.
        if (this.pauses === 0) this.push({ type: 'resume' });
    }

    private listen(target: unknown, signal: string, callback: (...args: never[]) => unknown): void {
        const object = target as Signals;
        this.ids.push([object, object.connect(signal, callback)]);
    }

    /** The lock screen pauses Stage Manager and hides the strip. */
    private syncLock(): void {
        const locked = Main.sessionMode.isLocked;
        if (locked === this.locked) return;
        this.locked = locked;
        this.strip.setPaused(locked);
        if (locked) this.pause();
        else this.resume();
    }

    private track(window: Meta.Window): void {
        const id = window.get_id();
        if (this.windows.has(id)) return;
        const ids = [
            window.connect('notify::minimized', () => this.onMinimized(window)),
            window.connect('unmanaged', () => this.onUnmanaged(window)),
            window.connect('workspace-changed', () => this.push({ type: 'workspace' })),
        ];
        this.windows.set(id, { window, ids });
    }

    private onCreated(window: Meta.Window): void {
        this.track(window);
        const entry = this.windows.get(window.get_id());
        if (!entry) return;
        // Act once it has drawn, so a thumbnail never shows an empty window.
        const shownId = window.connect('shown', () => {
            window.disconnect(shownId);
            entry.ids = entry.ids.filter((id) => id !== shownId);
            this.ready.add(window.get_id());
            this.push({ type: 'created', window: window.get_id() });
        });
        entry.ids.push(shownId);
    }

    private onMinimized(window: Meta.Window): void {
        if (this.applying) return;
        this.push({ type: window.minimized ? 'minimized' : 'unminimized', window: window.get_id() });
    }

    private onUnmanaged(window: Meta.Window): void {
        const id = window.get_id();
        const entry = this.windows.get(id);
        if (entry) for (const signal of entry.ids) window.disconnect(signal);
        this.windows.delete(id);
        this.ready.delete(id);
        this.push({ type: 'closed', window: id });
    }

    private push(event: StageEvent): void {
        const last = this.queue.at(-1);
        if (!(last && COALESCED.has(event.type) && last.type === event.type)) this.queue.push(event);
        this.schedule();
    }

    /** Events are handled together before the next frame, once the shell has settled. */
    private schedule(): void {
        if (this.later) return;
        this.later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.later = 0;
            this.flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    private flush(): void {
        if (Main.overview.visible) return;
        const events = this.queue;
        this.queue = [];
        for (const event of events) this.run(event);
        this.refresh();
    }

    private run(event: StageEvent): void {
        const plan = step(this.state, this.world(), event);
        this.state = plan.state;
        this.apply(plan);
    }

    /** Unminimize, focus, then minimize, without animations. */
    private apply(plan: Plan): void {
        const wm = Main.wm as unknown as WindowManager;
        const skip = (window: Meta.Window) => {
            const actor = window.get_compositor_private() as Meta.WindowActor | null;
            if (actor) wm.skipNextEffect(actor);
        };
        this.applying = true;
        try {
            for (const id of plan.unminimize) {
                const window = this.windows.get(id)?.window;
                if (!window?.minimized) continue;
                skip(window);
                window.unminimize();
            }
            if (plan.focus !== null) this.windows.get(plan.focus)?.window.activate(global.get_current_time());
            for (const id of plan.minimize) {
                const window = this.windows.get(id)?.window;
                if (!window || window.minimized) continue;
                skip(window);
                window.minimize();
            }
        } finally {
            this.applying = false;
        }
    }

    private world(): World {
        const workspace = global.workspace_manager.get_active_workspace();
        const primary = Main.layoutManager.primaryIndex;
        const windows = global.display
            .get_tab_list(Meta.TabList.NORMAL, workspace)
            .filter((window) => this.ready.has(window.get_id()) && this.eligible(window, workspace, primary))
            .map((window) => ({ id: window.get_id(), app: this.appId(window)!, minimized: window.minimized }));
        let focus = global.display.focus_window;
        // A dialog stands for its parent.
        if (focus?.get_transient_for()) focus = focus.find_root_ancestor();
        return { windows, focus: focus ? focus.get_id() : null };
    }

    private appId(window: Meta.Window): string | null {
        return this.tracker.get_window_app(window)?.get_id() ?? null;
    }

    private eligible(window: Meta.Window, workspace: Meta.Workspace, primary: number): boolean {
        return eligible({
            normal: window.get_window_type() === Meta.WindowType.NORMAL,
            skipTaskbar: window.skip_taskbar,
            onActiveWorkspace: window.located_on_workspace(workspace),
            onPrimary: window.get_monitor() === primary,
            sticky: window.is_on_all_workspaces(),
            above: window.is_above(),
            transient: window.get_transient_for() !== null,
            app: this.appId(window),
            wmClass: window.get_wm_class(),
        });
    }

    private refresh(): void {
        const list: StripStage[] = [];
        for (const stage of stages(this.state, this.world(), this.strip.capacity())) {
            const windows = stage.windows.map((id) => this.windows.get(id)?.window).filter((w): w is Meta.Window => Boolean(w));
            const app = windows[0] ? this.tracker.get_window_app(windows[0]) : null;
            if (app) list.push({ app, windows });
        }
        this.strip.update(list);
    }
}
