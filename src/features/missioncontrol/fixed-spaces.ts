import Gio from 'gi://Gio';
import type Meta from 'gi://Meta';

import { type FixedSpacesLink, isEmpty, setFixedSpaces } from '../../shared/fixed-spaces.js';
import { closeTarget, keptCount, takeOver } from './logic/spaces.js';

/** The user's num-workspaces from before Macr turned dynamic workspaces off; 0 when nothing is saved. */
const SAVED = 'mission-control-saved-workspaces';

/**
 * Spaces as on macOS: a desktop stays until it is closed, even empty. GNOME's
 * dynamic workspaces are off while this runs, with the desktops in use kept,
 * and come back on destroy with the user's own number of workspaces. The
 * originals are kept in a setting, so they come back after a crash too.
 */
export class FixedSpaces implements FixedSpacesLink {
    private readonly mutter = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
    private readonly preferences = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });

    constructor(private readonly settings: Gio.Settings) {
        const plan = takeOver(this.mutter.get_boolean('dynamic-workspaces'), settings.get_int(SAVED) > 0);
        if (plan.save) settings.set_int(SAVED, this.preferences.get_int('num-workspaces'));
        if (plan.switchOff) {
            const manager = global.workspace_manager;
            const count = manager.get_n_workspaces();
            const last = manager.get_workspace_by_index(count - 1);
            // Mutter keeps num-workspaces once dynamic workspaces go off.
            this.preferences.set_int('num-workspaces', keptCount(count, !!last && isEmpty(last)));
            this.mutter.set_boolean('dynamic-workspaces', false);
        }
        setFixedSpaces(this);
    }

    destroy(): void {
        setFixedSpaces(null);
        const count = this.settings.get_int(SAVED);
        if (count <= 0) return;
        // Dynamic first: with it on, mutter leaves the workspaces alone when the number changes.
        if (!this.mutter.get_boolean('dynamic-workspaces')) this.mutter.set_boolean('dynamic-workspaces', true);
        this.preferences.set_int('num-workspaces', count);
        this.settings.set_int(SAVED, 0);
    }

    add(time: number): Meta.Workspace {
        const workspace = global.workspace_manager.append_new_workspace(false, time);
        this.sync();
        return workspace;
    }

    close(workspace: Meta.Workspace, time: number): void {
        const manager = global.workspace_manager;
        const target = manager.get_workspace_by_index(closeTarget(workspace.index(), manager.get_n_workspaces()));
        if (!target) return;
        for (const window of workspace.list_windows()) if (!window.is_on_all_workspaces()) window.change_workspace(target);
        if (manager.get_active_workspace() === workspace) target.activate(time);
        manager.remove_workspace(workspace, time);
        this.sync();
    }

    /** With fixed workspaces mutter puts back num-workspaces whenever it changes: keep it in step. */
    private sync(): void {
        const count = global.workspace_manager.get_n_workspaces();
        if (this.preferences.get_int('num-workspaces') !== count) this.preferences.set_int('num-workspaces', count);
    }
}
