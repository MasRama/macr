import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { fixedSpaces } from '../../shared/fixed-spaces.js';
import { type Assignment, assignmentOf, placement, withAssignment } from './logic/assign.js';

const KEY = 'dock-app-desktops';

type Disconnectable = { disconnect(id: number): void };

/** Normal windows only: dialogs and menus follow their parent. */
function placeable(window: Meta.Window): boolean {
    return window.get_window_type() === Meta.WindowType.NORMAL && !window.is_skip_taskbar() && !window.get_transient_for();
}

/**
 * macOS's Assign To: a new window of an assigned app opens on every desktop
 * or on its own one, added at the end when it is gone.
 */
export class AppDesktops {
    private readonly ids: [Disconnectable, number][] = [];
    private readonly waiting = new Map<Meta.Window, number>();

    constructor(private readonly settings: Gio.Settings) {
        const display = global.display as unknown as { connect(signal: string, callback: (display: unknown, window: Meta.Window) => void): number } & Disconnectable;
        this.ids.push([display, display.connect('window-created', (_display, window) => this.placeNew(window))]);
    }

    get(appId: string): Assignment | null {
        return assignmentOf(this.settings.get_strv(KEY), appId);
    }

    /** Saves the app's assignment and moves its open windows to match. */
    assign(app: Shell.App, assignment: Assignment | null): void {
        this.settings.set_strv(KEY, withAssignment(this.settings.get_strv(KEY), app.get_id(), assignment));
        for (const window of app.get_windows()) if (placeable(window)) this.place(window, assignment);
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        for (const [window, id] of this.waiting) window.disconnect(id);
        this.waiting.clear();
    }

    private placeNew(window: Meta.Window): void {
        if (!placeable(window)) return;
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        // A Wayland window can be created before its app id is known: once it shows, then.
        if (!app || app.get_id().startsWith('window:')) {
            if (this.waiting.has(window)) return;
            const id = window.connect('shown', () => {
                window.disconnect(id);
                this.waiting.delete(window);
                const known = Shell.WindowTracker.get_default().get_window_app(window);
                if (known && !known.get_id().startsWith('window:')) this.place(window, this.get(known.get_id()));
            });
            this.waiting.set(window, id);
            return;
        }
        const assignment = this.get(app.get_id());
        if (assignment !== null) this.place(window, assignment);
    }

    private place(window: Meta.Window, assignment: Assignment | null): void {
        const manager = global.workspace_manager;
        const where = placement(assignment, manager.get_n_workspaces());
        if (!where) {
            if (window.is_on_all_workspaces()) window.unstick();
            return;
        }
        if (where.stick) {
            window.stick();
            return;
        }
        if (window.is_on_all_workspaces()) window.unstick();
        const time = global.get_current_time();
        // Through Mission Control's fixed Spaces while it runs, so it keeps them.
        for (let added = 0; added < where.add; added++) {
            const link = fixedSpaces();
            if (link) link.add(time);
            else manager.append_new_workspace(false, time);
        }
        window.change_workspace_by_index(where.index, false);
    }
}
