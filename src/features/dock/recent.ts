import type Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';

import { recentShown, withRecent, withoutRecent } from './logic/recent.js';

const ENABLED = 'dock-recent-apps';
const LIST = 'dock-recent-apps-list';

type Disconnectable = { disconnect(id: number): void };

/**
 * macOS's "Show suggested and recent apps in Dock": an app that quits and
 * is not kept in the dock stays after the running apps, up to three. The
 * list is kept in `dock-recent-apps-list` and only grows while the setting
 * is on.
 */
export class RecentApps {
    private readonly appSystem = Shell.AppSystem.get_default();
    private readonly ids: [Disconnectable, number][] = [];

    constructor(
        private readonly settings: Gio.Settings,
        changed: () => void,
    ) {
        this.ids.push([this.appSystem, this.appSystem.connect('app-state-changed', (_system: Shell.AppSystem, app: Shell.App) => this.onState(app))]);
        this.ids.push([settings, settings.connect(`changed::${ENABLED}`, changed)]);
        this.ids.push([settings, settings.connect(`changed::${LIST}`, changed)]);
    }

    /** The recent apps the dock shows now, after the running ones. */
    apps(): Shell.App[] {
        if (!this.settings.get_boolean(ENABLED)) return [];
        const running = this.appSystem.get_running().map((app) => app.get_id());
        const favorites = Object.keys(AppFavorites.getAppFavorites().getFavoriteMap());
        const ids = recentShown(this.settings.get_strv(LIST), {
            running,
            favorites,
            installed: (id) => this.appSystem.lookup_app(id) !== null,
        });
        return ids.map((id) => this.appSystem.lookup_app(id)).filter((app): app is Shell.App => app !== null);
    }

    /** Takes `id` out of the recent apps, or every one with no id. */
    forget(id?: string): void {
        this.settings.set_strv(LIST, withoutRecent(this.settings.get_strv(LIST), id));
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
    }

    private onState(app: Shell.App): void {
        if (app.state !== Shell.AppState.STOPPED || !this.settings.get_boolean(ENABLED)) return;
        const id = app.get_id();
        // Windows with no app of their own have made-up ids.
        if (!id || app.is_window_backed()) return;
        const favorites = Object.keys(AppFavorites.getAppFavorites().getFavoriteMap());
        const list = this.settings.get_strv(LIST);
        const next = withRecent(list, id, favorites);
        if (next.join('\n') !== list.join('\n')) this.settings.set_strv(LIST, next);
    }
}
