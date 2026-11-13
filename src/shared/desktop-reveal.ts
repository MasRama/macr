import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Rect } from './logic/geometry.js';
import { type Offset, revealOffset, sliverOf } from './logic/reveal.js';
import { type StageLink, stageManager } from './stage-link.js';

const SETTLE_MS = 300;
/** Logical px of each window left on screen. */
const SLIVER = 32;

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
type Easeable = { ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: (finished: boolean) => void }): void };

interface Moved {
    window: Meta.Window;
    actor: Meta.WindowActor;
    offset: Offset;
    destroyId: number;
}

function plain(rect: Rect): Rect {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Show Desktop as macOS does it: the windows slide to the side edges of
 * their screens, a sliver of each left showing; clicking one (or showing
 * the desktop again) brings them all back. Only the window actors move, so
 * nothing about the windows themselves changes. A gesture can drive it
 * part of the way with track() and finish it with settle().
 */
export class DesktopReveal {
    private moved: Moved[] = [];
    /** Where the windows are, 0 in place to 1 at the edges. */
    private progress = 0;
    private revealed = false;
    private slivers: St.Widget[] = [];
    private readonly ids: [Signals, number][] = [];
    private focused: Meta.Window | null = null;
    /** Stage Manager, paused while windows are moved: the focus going away is not the user switching apps. */
    private paused: StageLink | null = null;
    /** Each settle() counts: an older one's eases ending late do nothing. */
    private generation = 0;

    /** Whether the windows are at the edges (or going there). */
    get isRevealed(): boolean {
        return this.revealed;
    }

    toggle(): void {
        this.settle(!this.revealed);
    }

    /** Puts the windows `progress` (0–1) of the way to the edges, following the fingers. */
    track(progress: number): void {
        if (!this.moved.length && progress > 0) this.gather();
        this.unwatch();
        this.clearSlivers();
        this.place(progress);
    }

    /** Slides the windows the rest of the way: to the edges, or back in place. */
    settle(reveal: boolean): void {
        if (reveal && !this.moved.length) this.gather();
        this.unwatch();
        this.clearSlivers();
        this.revealed = reveal && this.moved.length > 0;
        if (!this.moved.length) return;
        const target = this.revealed ? 1 : 0;
        this.progress = target;
        const generation = ++this.generation;
        let pending = this.moved.length;
        const done = () => {
            if (--pending > 0 || generation !== this.generation) return;
            if (this.revealed) this.showSlivers();
            else this.release();
        };
        for (const { actor, offset } of this.moved) {
            (actor as unknown as Easeable).ease({
                translation_x: offset.x * target,
                translation_y: offset.y * target,
                duration: SETTLE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onStopped: done,
            });
        }
        if (this.revealed) {
            this.focused = global.display.focus_window;
            global.display.unset_input_focus(global.get_current_time());
            this.watch();
        }
    }

    /** Puts every window back at once. */
    destroy(): void {
        this.unwatch();
        this.clearSlivers();
        this.place(0);
        this.release();
        this.revealed = false;
    }

    /** The windows that show on this workspace, and where each goes. */
    private gather(): void {
        const monitors = Main.layoutManager.monitors.map(plain);
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const windows = global.workspace_manager.get_active_workspace().list_windows()
            .filter((w) => w.get_window_type() === Meta.WindowType.NORMAL && !w.skip_taskbar && !w.minimized && w.showing_on_its_workspace());
        for (const window of windows) {
            const actor = window.get_compositor_private() as Meta.WindowActor | null;
            const monitor = monitors[window.get_monitor()];
            if (!actor || !monitor) continue;
            const offset = revealOffset(plain(window.get_frame_rect()), monitor, monitors, SLIVER * scale);
            const destroyId = actor.connect('destroy', () => {
                this.moved = this.moved.filter((moved) => moved.actor !== actor);
            });
            this.moved.push({ window, actor, offset, destroyId });
        }
        if (this.moved.length && !this.paused) {
            this.paused = stageManager();
            this.paused?.pause();
        }
    }

    private place(progress: number): void {
        this.generation++;
        this.progress = progress;
        for (const { actor, offset } of this.moved) {
            actor.remove_transition('translation-x');
            actor.remove_transition('translation-y');
            actor.translation_x = offset.x * progress;
            actor.translation_y = offset.y * progress;
        }
    }

    /** Forgets the windows once they are back in place. */
    private release(): void {
        if (this.progress !== 0) return;
        for (const { actor, destroyId } of this.moved) actor.disconnect(destroyId);
        this.moved = [];
        const focused = this.focused;
        this.focused = null;
        if (focused && !global.display.focus_window && !focused.minimized) Main.activateWindow(focused);
        this.paused?.resume();
        this.paused = null;
    }

    /** A click on what still shows of a window brings them all back, that one in front. */
    private showSlivers(): void {
        const monitors = Main.layoutManager.monitors.map(plain);
        for (const { window, offset } of this.moved) {
            const monitor = monitors[window.get_monitor()];
            const rect = monitor && sliverOf(plain(window.get_frame_rect()), offset, monitor);
            if (!rect) continue;
            const sliver = new St.Widget({ name: 'macr-desktop-sliver', reactive: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
            sliver.connect('button-release-event', () => {
                this.focused = window;
                this.settle(false);
                return Clutter.EVENT_STOP;
            });
            Main.layoutManager.uiGroup.insert_child_above(sliver, global.window_group);
            this.slivers.push(sliver);
        }
    }

    private clearSlivers(): void {
        for (const sliver of this.slivers) sliver.destroy();
        this.slivers = [];
    }

    /** Anything that needs the windows brings them back: a window taking focus, another Space, Mission Control. */
    private watch(): void {
        const back = () => this.settle(false);
        const now = () => this.destroy();
        this.connect(global.display, 'notify::focus-window', () => {
            const window = global.display.focus_window;
            if (window && window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar) {
                this.focused = window;
                back();
            }
        });
        this.connect(global.workspace_manager, 'active-workspace-changed', now);
        this.connect(Main.overview, 'showing', now);
        this.connect(Main.layoutManager, 'monitors-changed', now);
    }

    private unwatch(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
    }

    private connect(object: object, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }
}

let shared: DesktopReveal | null = null;
let users = 0;

/** The one Show Desktop all modules share; release it in disable(). */
export function useDesktopReveal(): DesktopReveal {
    users++;
    shared ??= new DesktopReveal();
    return shared;
}

/** Puts the windows back once the last module using Show Desktop lets go. */
export function releaseDesktopReveal(): void {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    shared?.destroy();
    shared = null;
}
