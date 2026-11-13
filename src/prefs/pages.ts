import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { clashes, type Clash } from './logic/conflicts.js';
import { comboRow, dependsOn, group, spinRow, switchRow } from './rows.js';
import { tile, type TileColor } from './style.js';

/** One page of the settings window, with its sidebar entry. */
export interface PageInfo {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: TileColor;
    /** Pages with the same section sit together in the sidebar. */
    section: number;
    build: (context: PageContext) => Gtk.Widget[];
}

export interface PageContext {
    settings: Gio.Settings;
    version: string;
    url: string;
    window: Gtk.Window;
    /** Shows a short message at the bottom of the window. */
    toast: (title: string) => void;
    /** Runs when the window closes. */
    onClose: (cleanup: () => void) => void;
}

/** The pages in sidebar order. */
export function pages(): PageInfo[] {
    return [
        {
            id: 'menubar', section: 0, icon: 'focus-top-bar-symbolic', color: 'graphite',
            title: _('Menu Bar'),
            description: _('The logo menu, the focused app’s menus and the clock in the top bar.'),
            build: ({ settings }) => {
                const rows = [
                    switchRow(settings, 'menubar-app-menus', _('App menus'), _('The focused app’s own File, Edit and View menus, when the app shares them')),
                    switchRow(settings, 'menubar-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')),
                    switchRow(settings, 'hide-distro-menu-button', _('Hide the distribution menu button'), _('Such as Zorin Menu')),
                ];
                dependsOn(settings, 'menubar-enabled', ...rows);
                return [
                    group('', [switchRow(settings, 'menubar-enabled', _('macOS menu bar'), _('Logo menu, app menu, Window menu and clock in the top bar'))]),
                    group(_('Menu bar'), rows),
                ];
            },
        },
        {
            id: 'controlcenter', section: 0, icon: 'emblem-system-symbolic', color: 'gray',
            title: _('Control Center'),
            description: _('Quick settings as macOS tiles, and the volume and brightness pill.'),
            build: ({ settings }) => [
                group('', [
                    switchRow(settings, 'control-center-enabled', _('macOS Control Center'), _('Quick settings with Focus, titled sliders and macOS tiles')),
                    switchRow(settings, 'osd-enabled', _('macOS volume and brightness'), _('A small pill under the menu bar at the top right')),
                ]),
            ],
        },
        {
            id: 'notifications', section: 0, icon: 'preferences-system-notifications-symbolic', color: 'red',
            title: _('Notifications'),
            description: _('Banners at the top right and the Notification Center on the clock.'),
            build: ({ settings }) => [
                group('', [switchRow(settings, 'notifications-enabled', _('macOS notifications'), _('Banners at the top right and a macOS Notification Center on the clock'))]),
            ],
        },
        {
            id: 'dock', section: 1, icon: 'user-desktop-symbolic', color: 'graphite',
            title: _('Dock'),
            description: _('Your favourite and running apps at the bottom of the screen.'),
            build: ({ settings }) => {
                const rows = [
                    switchRow(settings, 'dock-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')),
                    spinRow(settings, 'dock-icon-size', _('Icon size'), _('In pixels, before magnification'), 32, 96, 4),
                    switchRow(settings, 'dock-magnification', _('Magnification'), _('Icons grow under the pointer')),
                    switchRow(settings, 'dock-autohide', _('Hide when a window covers it'), _('Push the pointer to the bottom edge to show it again')),
                    switchRow(settings, 'dock-genie', _('Genie minimize'), _('Windows pour into their dock icon')),
                    switchRow(settings, 'dock-downloads', _('Downloads stack'), _('Your newest downloads, a click away next to the Trash')),
                    comboRow(settings, 'dock-downloads-view', _('Show the stack as'), [
                        ['automatic', _('Automatic')],
                        ['fan', _('Fan')],
                        ['grid', _('Grid')],
                    ]),
                ];
                dependsOn(settings, 'dock-enabled', ...rows);
                return [
                    group('', [switchRow(settings, 'dock-enabled', _('macOS dock'), _('Replaces Dash to Dock and the overview’s dash'))]),
                    group(_('Dock'), rows),
                ];
            },
        },
        {
            id: 'launchpad', section: 1, icon: 'view-app-grid-symbolic', color: 'blue',
            title: _('Launchpad & Spotlight'),
            description: _('Every app in a full-screen grid, and search on Ctrl+Space.'),
            build: ({ settings }) => {
                const superKey = switchRow(settings, 'launchpad-super-key', _('Super key opens Launchpad'), _('Instead of the overview or the distribution’s app menu'));
                dependsOn(settings, 'launchpad-enabled', superKey);
                return [
                    group(_('Launchpad'), [
                        switchRow(settings, 'launchpad-enabled', _('Launchpad'), _('Every app in a full-screen grid, from the dock’s Apps icon')),
                        superKey,
                    ]),
                    group(_('Spotlight'), [switchRow(settings, 'spotlight-enabled', _('Spotlight'), _('Search apps, files and settings with Ctrl+Space'))]),
                ];
            },
        },
        {
            id: 'missioncontrol', section: 1, icon: 'preferences-desktop-multitasking-symbolic', color: 'purple',
            title: _('Mission Control'),
            description: _('All your windows and Spaces at a glance, one app at a time with Stage Manager, and the screen corners that open Mission Control and more.'),
            build: ({ settings }) => {
                const actions: [string, string][] = [
                    ['none', _('Nothing')],
                    ['mission-control', _('Mission Control')],
                    ['launchpad', _('Launchpad')],
                    ['desktop', _('Desktop')],
                    ['notification-center', _('Notification Center')],
                    ['lock-screen', _('Lock Screen')],
                ];
                const corners: [string, string][] = [
                    ['hot-corner-top-left', _('Top left')],
                    ['hot-corner-top-right', _('Top right')],
                    ['hot-corner-bottom-left', _('Bottom left')],
                    ['hot-corner-bottom-right', _('Bottom right')],
                ];
                const cornerRows = corners.map(([key, title]) => comboRow(settings, key, title, actions));
                const exposeShortcut = shortcutsRow(settings, _('For the focused app'), [['app-expose-shortcut', _('App Exposé')]]);
                dependsOn(settings, 'app-expose-enabled', exposeShortcut);
                dependsOn(settings, 'hot-corners-enabled', ...cornerRows);
                return [
                    group('', [switchRow(settings, 'mission-control-enabled', _('macOS Mission Control'), _('Windows over the dimmed wallpaper, Spaces always at the top'))]),
                    group(_('Spaces'), [
                        switchRow(settings, 'fullscreen-spaces-enabled', _('Full-screen apps get their own Space'), _('A window that goes full screen moves to a new workspace, and back when it leaves full screen')),
                    ]),
                    group(_('App Exposé'), [
                        switchRow(settings, 'app-expose-enabled', _('App Exposé'), _('All of one app’s windows at a glance, from Show All Windows in the dock icon’s menu')),
                        exposeShortcut,
                    ]),
                    group(_('Stage Manager'), [
                        switchRow(settings, 'stage-manager-enabled', _('Stage Manager'), _('The app you use stays in the middle; your other apps wait on the left, a click away')),
                    ]),
                    group(_('Hot corners'), [
                        switchRow(settings, 'hot-corners-enabled', _('Hot corners'), _('Push the pointer into a screen corner')),
                        ...cornerRows,
                    ]),
                ];
            },
        },
        {
            id: 'windows', section: 1, icon: 'focus-windows-symbolic', color: 'blue',
            title: _('Windows'),
            description: _('Tiling, traffic lights and rounded corners on app windows.'),
            build: ({ settings }) => {
                const radius = spinRow(settings, 'window-corner-radius', _('Corner radius'), _('In pixels'), 0, 32, 1);
                dependsOn(settings, 'window-corners-enabled', radius);
                const tiling = [
                    switchRow(settings, 'tiling-margins', _('Tiled windows have margins'), _('A small gap around tiled windows and between them')),
                    tilingShortcutsRow(settings),
                ];
                dependsOn(settings, 'tiling-enabled', ...tiling);
                return [
                    group(_('Tiling'), [
                        switchRow(settings, 'tiling-enabled', _('Window tiling'), _('Drag a window to a screen edge or corner, or use the keyboard shortcuts')),
                        ...tiling,
                    ]),
                    group(_('Title bar'), [
                        switchRow(settings, 'traffic-lights-enabled', _('Traffic lights'), _('Red, yellow and green window buttons on the left; apps show them when reopened')),
                    ]),
                    group(_('Corners'), [
                        switchRow(settings, 'window-corners-enabled', _('Rounded corners'), _('For apps that do not round their own, such as Qt and Electron apps')),
                        radius,
                    ]),
                ];
            },
        },
        {
            id: 'screenshot', section: 1, icon: 'camera-photo-symbolic', color: 'graphite',
            title: _('Screenshots'),
            description: _('Super+Shift+3, 4 and 5, and a floating thumbnail after each screenshot.'),
            build: ({ settings }) => {
                const rows = [
                    switchRow(settings, 'screenshot-thumbnail', _('Show floating thumbnail'), _('A small copy at the bottom right for a few seconds, instead of the notification')),
                    screenshotShortcutsRow(settings),
                ];
                dependsOn(settings, 'screenshot-enabled', ...rows);
                return [
                    group('', [
                        switchRow(settings, 'screenshot-enabled', _('macOS screenshots'), _('The whole screen, a dragged area or a window, and the screenshot toolbar')),
                        ...rows,
                    ]),
                ];
            },
        },
        {
            id: 'keyboard', section: 1, icon: 'input-keyboard-symbolic', color: 'gray',
            title: _('Keyboard'),
            description: _('The Mac’s Command shortcuts on the Super key.'),
            build: ({ settings }) => {
                const shortcuts = keyboardShortcutsRow(settings);
                dependsOn(settings, 'keyboard-enabled', shortcuts);
                return [
                    group('', [
                        switchRow(settings, 'keyboard-enabled', _('Mac keyboard shortcuts'), _('Quit, minimize and hide apps as on a Mac; GNOME’s own Super+H and Super+M give way')),
                        shortcuts,
                    ]),
                ];
            },
        },
        {
            id: 'appearance', section: 2, icon: 'preferences-desktop-appearance-symbolic', color: 'orange',
            title: _('Appearance'),
            description: _('App icons and the app switcher.'),
            build: ({ settings }) => [
                group(_('App icons'), [switchRow(settings, 'app-icon-tiles', _('macOS tiles for other icons'), _('Apps your icon theme does not cover get their icon on a macOS tile'))]),
                group(_('App switcher'), [switchRow(settings, 'switcher-enabled', _('macOS app switcher'), _('Alt+Tab as a frosted panel with big icons'))]),
            ],
        },
        {
            id: 'lockscreen', section: 2, icon: 'system-lock-screen-symbolic', color: 'gray',
            title: _('Lock Screen'),
            description: _('A big clock at the top, your picture and the password field below.'),
            build: ({ settings, url, window }) => {
                const login = new Adw.ActionRow({
                    title: _('Login screen'),
                    subtitle: _('The same look on the login screen needs Macr installed for the login screen with scripts/login-screen.sh'),
                });
                login.add_suffix(linkButton(_('How'), `${url}#login-screen`, window));
                return [
                    group('', [switchRow(settings, 'lock-screen-enabled', _('macOS lock screen'), _('A big clock at the top, your picture and the password field below'))]),
                    group(_('Login screen'), [login]),
                ];
            },
        },
        {
            id: 'about', section: 3, icon: 'help-about-symbolic', color: 'gray',
            title: _('About Macr'),
            description: _('The complete macOS experience for your Linux desktop.'),
            build: (context) => [
                group('', [
                    new Adw.ActionRow({ title: _('Version'), subtitle: context.version }),
                    linkRow(_('Website'), context.url, context.window),
                    linkRow(_('Report a problem'), `${context.url}/issues`, context.window),
                ]),
                clashGroup(context),
            ],
        },
    ];
}

/** The page's header: its big tile, title and description, as in System Settings. */
export function pageHeader(page: PageInfo): Gtk.Widget {
    const box = new Gtk.Box({ spacing: 16, css_classes: ['macr-page-header'] });
    box.append(tile(page.icon, page.color, true));
    const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, valign: Gtk.Align.CENTER, hexpand: true });
    text.append(new Gtk.Label({ label: page.title, xalign: 0, css_classes: ['title'] }));
    text.append(new Gtk.Label({ label: page.description, xalign: 0, wrap: true, css_classes: ['dim-label'] }));
    box.append(text);
    const header = new Adw.PreferencesGroup();
    header.add(box);
    return header;
}

/** The tiling shortcuts that are set, read-only. */
function tilingShortcutsRow(settings: Gio.Settings): Gtk.Widget {
    return shortcutsRow(settings, _('Super+Ctrl stands in for the Fn and Control keys of a Mac'), [
        ['tiling-left', _('Left half')],
        ['tiling-right', _('Right half')],
        ['tiling-top', _('Top half')],
        ['tiling-bottom', _('Bottom half')],
        ['tiling-top-left', _('Top left quarter')],
        ['tiling-top-right', _('Top right quarter')],
        ['tiling-bottom-left', _('Bottom left quarter')],
        ['tiling-bottom-right', _('Bottom right quarter')],
        ['tiling-fill', _('Fill')],
        ['tiling-center', _('Center')],
        ['tiling-return', _('Return to previous size')],
        ['tiling-arrange-left-right', _('Arrange left and right')],
        ['tiling-arrange-right-left', _('Arrange right and left')],
        ['tiling-arrange-top-bottom', _('Arrange top and bottom')],
        ['tiling-arrange-bottom-top', _('Arrange bottom and top')],
    ]);
}

/** The screenshot shortcuts that are set, read-only. */
function screenshotShortcutsRow(settings: Gio.Settings): Gtk.Widget {
    return shortcutsRow(settings, _('Super stands in for the Command key of a Mac; Print still opens the toolbar'), [
        ['screenshot-screen-shortcut', _('Entire screen')],
        ['screenshot-area-shortcut', _('Selected area or window')],
        ['screenshot-toolbar-shortcut', _('Screenshot toolbar')],
    ]);
}

/** The Command shortcuts that are set, read-only. */
function keyboardShortcutsRow(settings: Gio.Settings): Gtk.Widget {
    return shortcutsRow(settings, _('Super stands in for the Command key; Super+Tab and Super+` already switch apps and windows'), [
        ['keyboard-quit', _('Quit app')],
        ['keyboard-minimize', _('Minimize window')],
        ['keyboard-hide', _('Hide app')],
        ['keyboard-hide-others', _('Hide others')],
    ]);
}

/** Keyboard shortcuts that are set, read-only, each as a key name and a title. */
function shortcutsRow(settings: Gio.Settings, subtitle: string, shortcuts: [string, string][]): Gtk.Widget {
    const expander = new Adw.ExpanderRow({ title: _('Keyboard shortcuts'), subtitle });
    for (const [key, title] of shortcuts) {
        const accelerator = settings.get_strv(key)[0];
        if (!accelerator) continue;
        const row = new Adw.ActionRow({ title });
        row.add_suffix(new Gtk.ShortcutLabel({ accelerator, valign: Gtk.Align.CENTER }));
        expander.add_row(row);
    }
    return expander;
}

/** What each Macr setting a clash is about is called, for the clash's subtitle. */
function moduleName(setting: string): string {
    const names: Record<string, string> = {
        'dock-enabled': _('the dock'),
        'dock-genie': _('the genie minimize'),
        'menubar-enabled': _('the menu bar'),
        'window-corners-enabled': _('rounded corners'),
        'tiling-enabled': _('window tiling'),
    };
    return names[setting] ?? setting;
}

/** Enabled extensions that fight a Macr module that is on, kept up to date. */
function clashGroup({ settings, toast, onClose }: PageContext): Gtk.Widget {
    const box = new Adw.PreferencesGroup({
        title: _('Clashing extensions'),
        description: _('These change the same part of the desktop as Macr. Turn them off, or the two fight over it.'),
    });
    const shell = new Gio.Settings({ schema_id: 'org.gnome.shell' });
    const schema = settings.settings_schema;
    let rows: Gtk.Widget[] = [];

    const refresh = () => {
        for (const row of rows) box.remove(row);
        const enabled = shell.get_boolean('disable-user-extensions') ? [] : shell.get_strv('enabled-extensions');
        const found = clashes(enabled, (key) => schema.has_key(key) && settings.get_boolean(key));
        rows = found.length ? found.map((clash) => clashRow(clash, toast)) : [emptyRow()];
        for (const row of rows) box.add(row);
    };
    refresh();
    const ids = [
        shell.connect('changed::enabled-extensions', refresh),
        shell.connect('changed::disable-user-extensions', refresh),
    ];
    const macrId = settings.connect('changed', refresh);
    onClose(() => {
        for (const id of ids) shell.disconnect(id);
        settings.disconnect(macrId);
    });
    return box;
}

function emptyRow(): Gtk.Widget {
    const row = new Adw.ActionRow({ title: _('No clashing extensions') });
    row.add_prefix(new Gtk.Image({ icon_name: 'emblem-ok-symbolic', css_classes: ['success'] }));
    return row;
}

function clashRow(clash: Clash, toast: (title: string) => void): Gtk.Widget {
    const subtitle = clash.partial
        ? _('Part of it also changes %s; turn that part off in its own settings').format(moduleName(clash.setting))
        : _('Also changes %s').format(moduleName(clash.setting));
    const row = new Adw.ActionRow({ title: clash.name, subtitle });
    row.add_prefix(new Gtk.Image({ icon_name: 'dialog-warning-symbolic', css_classes: ['warning'] }));
    if (!clash.partial) {
        const button = new Gtk.Button({ label: _('Turn Off'), valign: Gtk.Align.CENTER });
        button.connect('clicked', () => {
            button.sensitive = false;
            disableExtension(clash.uuid, (error) => {
                button.sensitive = true;
                toast(error ? _('Could not turn it off: %s').format(error) : _('Could not turn it off'));
            });
        });
        row.add_suffix(button);
    }
    return row;
}

/**
 * Asks the shell to turn an extension off for this user. On success the
 * enabled list changes and the row goes away; otherwise `failed` runs.
 */
function disableExtension(uuid: string, failed: (error?: string) => void): void {
    Gio.DBus.session.call(
        'org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions', 'DisableExtension',
        new GLib.Variant('(s)', [uuid]), new GLib.VariantType('(b)'), Gio.DBusCallFlags.NONE, -1, null,
        (connection, result) => {
            try {
                const [ok] = connection?.call_finish(result)?.deepUnpack() as [boolean];
                if (!ok) failed();
            } catch (e) {
                failed(String(e));
            }
        },
    );
}

function linkRow(title: string, uri: string, window: Gtk.Window): Gtk.Widget {
    const row = new Adw.ActionRow({ title, subtitle: uri, activatable: true });
    row.add_suffix(new Gtk.Image({ icon_name: 'adw-external-link-symbolic' }));
    row.connect('activated', () => openUri(uri, window));
    return row;
}

function linkButton(label: string, uri: string, window: Gtk.Window): Gtk.Widget {
    const button = new Gtk.Button({ label, valign: Gtk.Align.CENTER });
    button.connect('clicked', () => openUri(uri, window));
    return button;
}

function openUri(uri: string, window: Gtk.Window): void {
    // Without a callback GJS fires and forgets; nothing to wait for.
    void new Gtk.UriLauncher({ uri }).launch(window, null);
}
