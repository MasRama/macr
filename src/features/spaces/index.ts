import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import type { Module } from '../../shared/module.js';
import { returnIndex, shouldMove } from './logic/spaces.js';

interface Moved {
    /** The workspace it came from, and its index then. */
    origin: Meta.Workspace;
    originIndex: number;
    /** The Space Macr made for it. */
    space: Meta.Workspace;
}

/**
 * Full-screen apps get their own Space, as on macOS: a window that goes full
 * screen moves to a new workspace right after its own, which becomes the
 * active one, and goes back when it leaves full screen. GNOME's dynamic
 * workspaces then remove the empty one.
 */
export class FullscreenSpacesModule implements Module {
    private readonly mutter = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
    private readonly windows = new Map<Meta.Window, number[]>();
    private readonly moved = new Map<Meta.Window, Moved>();
    private createdId = 0;
    private laters: number[] = [];

    enable(): void {
        for (const actor of global.get_window_actors()) this.watch(actor.meta_window);
        this.createdId = global.display.connect('window-created', (_display: Meta.Display, window: Meta.Window) => this.watch(window));
    }

    disable(): void {
        global.display.disconnect(this.createdId);
        this.createdId = 0;
        const laters = global.compositor.get_laters();
        for (const id of this.laters) laters.remove(id);
        this.laters = [];
        for (const window of [...this.moved.keys()]) this.goBack(window, false);
        for (const [window, ids] of this.windows) for (const id of ids) window.disconnect(id);
        this.windows.clear();
    }

    private watch(window: Meta.Window): void {
        if (this.windows.has(window)) return;
        this.windows.set(window, [
            window.connect('notify::fullscreen', () => this.later(() => this.onFullscreen(window))),
            window.connect('unmanaged', () => this.onUnmanaged(window)),
        ]);
    }

    /** Mutter is mid-way through the change when it notifies: act just before the next frame. */
    private later(callback: () => void): void {
        const laters = global.compositor.get_laters();
        const id = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.laters = this.laters.filter((other) => other !== id);
            callback();
            return false;
        });
        this.laters.push(id);
    }

    private onFullscreen(window: Meta.Window): void {
        if (!this.windows.has(window)) return;
        if (window.is_fullscreen()) this.giveSpace(window);
        else this.goBack(window, true);
    }

    private giveSpace(window: Meta.Window): void {
        if (this.moved.has(window)) return;
        const origin = window.get_workspace();
        if (!origin) return;
        const others = origin.list_windows().filter((other) => other !== window && other.showing_on_its_workspace() && other.get_window_type() === Meta.WindowType.NORMAL && !other.skip_taskbar);
        const move = shouldMove({
            normal: window.get_window_type() === Meta.WindowType.NORMAL,
            onAllWorkspaces: window.is_on_all_workspaces(),
            dynamic: this.mutter.get_boolean('dynamic-workspaces'),
            othersShowing: others.length,
        });
        if (!move) return;
        const manager = global.workspace_manager;
        const time = global.get_current_time();
        const space = manager.append_new_workspace(false, time);
        manager.reorder_workspace(space, origin.index() + 1);
        this.moved.set(window, { origin, originIndex: origin.index(), space });
        window.change_workspace(space);
        space.activate_with_focus(window, time);
    }

    /** Back where it came from; `follow` switches there too when its Space is the one showing. */
    private goBack(window: Meta.Window, follow: boolean): void {
        const moved = this.moved.get(window);
        if (!moved) return;
        this.moved.delete(window);
        // Moved elsewhere by hand since: leave it there.
        if (window.get_workspace() !== moved.space) return;
        const target = this.originOf(moved);
        const manager = global.workspace_manager;
        const showing = manager.get_active_workspace() === moved.space;
        window.change_workspace(target);
        if (showing) {
            const time = global.get_current_time();
            if (follow) target.activate_with_focus(window, time);
            else target.activate(time);
        }
    }

    private onUnmanaged(window: Meta.Window): void {
        const ids = this.windows.get(window);
        if (ids) for (const id of ids) window.disconnect(id);
        this.windows.delete(window);
        const moved = this.moved.get(window);
        this.moved.delete(window);
        if (moved && global.workspace_manager.get_active_workspace() === moved.space) this.originOf(moved).activate(global.get_current_time());
    }

    private originOf(moved: Moved): Meta.Workspace {
        const manager = global.workspace_manager;
        const count = manager.get_n_workspaces();
        for (let i = 0; i < count; i++) if (manager.get_workspace_by_index(i) === moved.origin) return moved.origin;
        return manager.get_workspace_by_index(returnIndex(moved.originIndex, count))!;
    }
}
