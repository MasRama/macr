import type Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { askToEmptyTrash } from '../../shared/empty-trash.js';
import { launchpad } from '../../shared/launchpad-link.js';
import { recentFiles } from '../../shared/logic/recent-files.js';
import type { Provider, ResultMeta } from './answers.js';
import { ACTIONS_PROVIDER, ALL_APPS_PROVIDER, alphabetical, FREQUENT_PROVIDER, matchItems, RECENT_PROVIDER } from './logic/views.js';

/** Most used apps on an empty Apps view. */
const FREQUENT = 8;
/** Recent files on an empty Files view; matches are looked for in more. */
const RECENT = { shown: 20, read: 500 };
/** Apps' own actions ("New Private Window") listed at most. */
const APP_ACTIONS = 20;

// misc/systemActions.js; the @girs typings for 46 lack these.
interface SystemActionsApi {
    _actions: Map<string, { available: boolean }>;
    getMatchingActions(terms: string[]): string[];
    getName(id: string): string;
    getIconName(id: string): string;
    activateAction(id: string): void;
}

function systemActions(): SystemActionsApi {
    return SystemActions.getDefault() as unknown as SystemActionsApi;
}

function themedIcon(name: string): (size: number) => Clutter.Actor {
    return (size) => new St.Icon({ icon_name: name, icon_size: size });
}

function appIcon(app: Shell.App): (size: number) => Clutter.Actor {
    return (size) => app.create_icon_texture(size);
}

function openUri(uri: string): void {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    } catch (error) {
        console.warn(`Macr: could not open ${uri}: ${error}`);
    }
}

/** A provider that works its list out at once; metas wait in a map until asked for. */
abstract class Listed implements Provider {
    private readonly metas = new Map<string, ResultMeta & { run?: () => void }>();

    constructor(
        readonly id: string,
        readonly title: string,
    ) {}

    getInitialResultSet(terms: string[]): Promise<string[]> {
        this.metas.clear();
        const metas = this.list(terms);
        for (const meta of metas) this.metas.set(meta.id, meta);
        return Promise.resolve(metas.map((meta) => meta.id));
    }

    filterResults(results: string[], max: number): string[] {
        return results.slice(0, max);
    }

    getResultMetas(ids: string[]): Promise<ResultMeta[]> {
        return Promise.resolve(ids.flatMap((id) => this.metas.get(id) ?? []));
    }

    activateResult(id: string): void {
        this.metas.get(id)?.run?.();
    }

    protected abstract list(terms: string[]): (ResultMeta & { run?: () => void })[];
}

function appMeta(app: Shell.App): ResultMeta & { run: () => void } {
    return { id: app.get_id(), name: app.get_name(), createIcon: appIcon(app), run: () => app.activate() };
}

function shown(app: Shell.App | null): app is Shell.App {
    return !!app && (app.get_app_info()?.should_show() ?? false);
}

/** The Apps view's empty field: the apps used most, as in the Dock's Recents. */
class FrequentApps extends Listed {
    constructor() {
        super(FREQUENT_PROVIDER, _('Frequently Used'));
    }

    protected list(): (ResultMeta & { run: () => void })[] {
        return Shell.AppUsage.get_default().get_most_used().filter(shown).slice(0, FREQUENT).map(appMeta);
    }
}

/** The Apps view's empty field: every app A to Z. */
class AllApps extends Listed {
    constructor() {
        super(ALL_APPS_PROVIDER, _('Applications'));
    }

    protected list(): (ResultMeta & { run: () => void })[] {
        const system = Shell.AppSystem.get_default();
        const apps = system
            .get_installed()
            .filter((info) => info.should_show())
            .map((info) => system.lookup_app(info.get_id() ?? ''))
            .filter(shown);
        return alphabetical(apps, (app) => app.get_name()).map(appMeta);
    }
}

/** The files used last (~/.local/share/recently-used.xbel) whose name matches. */
class RecentFiles extends Listed {
    constructor() {
        super(RECENT_PROVIDER, _('Recent Files'));
    }

    protected list(terms: string[]): (ResultMeta & { run: () => void })[] {
        const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
        let text = '';
        try {
            const [ok, bytes] = GLib.file_get_contents(path);
            if (ok) text = new TextDecoder().decode(bytes);
        } catch {
            // No recent files yet.
        }
        const home = GLib.get_home_dir();
        const found = [];
        for (const file of matchItems(recentFiles(text, RECENT.read), terms)) {
            const gfile = Gio.File.new_for_uri(file.uri);
            if (!gfile.query_exists(null)) continue;
            const folder = gfile.get_parent()?.get_path() ?? '';
            found.push({
                id: file.uri,
                name: file.name,
                description: folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder,
                createIcon: fileIcon(gfile),
                run: () => openUri(file.uri),
            });
            if (found.length >= RECENT.shown) break;
        }
        return found;
    }
}

/** The file's thumbnail when one was made, else its type's icon. */
function fileIcon(file: Gio.File): (size: number) => Clutter.Actor {
    return (size) => {
        let gicon: Gio.Icon = new Gio.ThemedIcon({ name: 'text-x-generic' });
        try {
            const info = file.query_info('standard::icon,thumbnail::path', Gio.FileQueryInfoFlags.NONE, null);
            const thumbnail = info.get_attribute_byte_string('thumbnail::path');
            gicon = thumbnail ? new Gio.FileIcon({ file: Gio.File.new_for_path(thumbnail) }) : (info.get_icon() ?? gicon);
        } catch {
            // Gone since it was listed: the plain icon.
        }
        return new St.Icon({ gicon, icon_size: size });
    };
}

/** A quick setting Spotlight turns on or off. */
function toggle(id: string, name: string, keywords: string[], icon: string, read: () => boolean, write: (on: boolean) => void) {
    const on = read();
    return { id, name, keywords, description: on ? _('On') : _('Off'), createIcon: themedIcon(icon), run: () => write(!on) };
}

/**
 * Things to do rather than open: GNOME's system actions (Lock Screen, Log
 * Out, Restart…), Macr's (Dark Mode, Do Not Disturb, Empty Trash, Mission
 * Control, Launchpad) and the apps' own actions ("New Private Window").
 */
class ActionsProvider extends Listed {
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly notifications = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });

    constructor() {
        super(ACTIONS_PROVIDER, _('Actions'));
    }

    protected list(terms: string[]): (ResultMeta & { run?: () => void })[] {
        const system = systemActions();
        const systemIds = terms.length ? system.getMatchingActions(terms) : [...system._actions].filter(([, action]) => action.available).map(([id]) => id);
        const found: (ResultMeta & { run?: () => void })[] = systemIds.map((id) => ({
            id: `system:${id}`,
            name: system.getName(id),
            createIcon: themedIcon(system.getIconName(id)),
            run: () => system.activateAction(id),
        }));
        found.push(...matchItems(this.macrActions(), terms));
        if (terms.length) found.push(...appActions(terms));
        return found;
    }

    private macrActions(): (ResultMeta & { keywords: string[]; run: () => void })[] {
        return [
            toggle(
                'macr:dark-mode',
                _('Dark Mode'),
                [_('appearance'), _('theme'), _('light')],
                'weather-clear-night-symbolic',
                () => this.interface.get_string('color-scheme') === 'prefer-dark',
                (on) => this.interface.set_string('color-scheme', on ? 'prefer-dark' : 'default'),
            ),
            toggle(
                'macr:do-not-disturb',
                _('Do Not Disturb'),
                [_('focus'), _('notifications'), _('dnd')],
                'notifications-disabled-symbolic',
                () => !this.notifications.get_boolean('show-banners'),
                (on) => this.notifications.set_boolean('show-banners', !on),
            ),
            { id: 'macr:empty-trash', name: _('Empty Trash'), keywords: [_('bin'), _('delete')], createIcon: themedIcon('user-trash-full-symbolic'), run: () => askToEmptyTrash() },
            { id: 'macr:mission-control', name: _('Mission Control'), keywords: [_('overview'), _('windows'), _('desktops')], createIcon: themedIcon('view-grid-symbolic'), run: () => Main.overview.show() },
            {
                id: 'macr:launchpad',
                name: _('Launchpad'),
                keywords: [_('applications'), _('apps')],
                createIcon: themedIcon('view-app-grid-symbolic'),
                run: () => {
                    const link = launchpad();
                    if (link) {
                        if (!link.isOpen) link.toggle();
                    } else {
                        Main.overview.showApps();
                    }
                },
            },
        ];
    }
}

/** The installed apps' desktop actions matching every term, by action and app name. */
function appActions(terms: string[]): (ResultMeta & { run: () => void })[] {
    const system = Shell.AppSystem.get_default();
    const actions = [];
    for (const info of system.get_installed()) {
        if (!info.should_show() || !(info instanceof Gio.DesktopAppInfo)) continue;
        const app = system.lookup_app(info.get_id() ?? '');
        if (!app) continue;
        for (const action of info.list_actions()) {
            const name = info.get_action_name(action);
            if (!name) continue;
            actions.push({
                id: `app:${app.get_id()}:${action}`,
                name: `${name} — ${app.get_name()}`,
                createIcon: appIcon(app),
                run: () => app.launch_action(action, global.get_current_time(), -1),
            });
        }
    }
    return matchItems(actions, terms, APP_ACTIONS);
}

/** Macr's providers for the views, by id. */
export function macrViewProviders(): Map<string, Provider> {
    const providers: Provider[] = [new FrequentApps(), new AllApps(), new RecentFiles(), new ActionsProvider()];
    return new Map(providers.map((provider) => [provider.id, provider]));
}
