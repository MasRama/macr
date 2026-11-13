import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { withStack } from '../features/dock/logic/stack.js';
import { setAppearance } from '../shared/appearance.js';
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
            build: (context) => {
                const { settings } = context;
                const rows = [
                    switchRow(settings, 'dock-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')),
                    spinRow(settings, 'dock-icon-size', _('Icon size'), _('In pixels, before magnification'), 32, 96, 4),
                    switchRow(settings, 'dock-magnification', _('Magnification'), _('Icons grow under the pointer')),
                    switchRow(settings, 'dock-autohide', _('Hide when a window covers it'), _('Push the pointer to the bottom edge to show it again')),
                    switchRow(settings, 'dock-genie', _('Genie minimize'), _('Windows pour into their dock icon')),
                    switchRow(settings, 'dock-recent-apps', _('Show recent apps'), _('The last three apps you quit stay in the dock after the running apps')),
                ];
                const stacks = stacksGroup(context);
                dependsOn(settings, 'dock-enabled', ...rows, stacks);
                return [
                    group('', [switchRow(settings, 'dock-enabled', _('macOS dock'), _('Replaces Dash to Dock and the overview’s dash'))]),
                    group(_('Dock'), rows),
                    stacks,
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
            description: _('Light, dark or auto, the accent colour, the desktop, app icons and the app switcher.'),
            build: ({ settings }) => [
                group('', [appearanceRow(settings), accentRow(settings)]),
                group(_('Desktop'), [
                    switchRow(settings, 'dynamic-desktop-enabled', _('Dynamic desktop'), _('Your desktop picture follows the time of day: warm at sunrise and sunset, dimmer and cooler at night')),
                    widgetsRow(settings),
                ]),
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

/**
 * The dock's stacks: Downloads, the folders added (each with a remove
 * button), Add Folder… and how stacks open.
 */
function stacksGroup({ settings, window, onClose }: PageContext): Adw.PreferencesGroup {
    const box = new Adw.PreferencesGroup({ title: _('Stacks'), description: _('Folders next to the Trash; click one to see its newest items') });
    box.add(switchRow(settings, 'dock-downloads', _('Downloads'), _('Your newest downloads, a click away')));
    let folderRows: Gtk.Widget[] = [];
    const addRow = new Adw.ActionRow({ title: _('Add Folder…'), activatable: true });
    addRow.add_prefix(new Gtk.Image({ icon_name: 'list-add-symbolic' }));
    addRow.connect('activated', () => {
        const dialog = new Gtk.FileDialog({ title: _('Add a Stack to the Dock'), modal: true });
        // The callback form: GJS has not promisified it here.
        const select = dialog.select_folder.bind(dialog) as unknown as (parent: Gtk.Window, cancellable: null, done: (source: unknown, result: Gio.AsyncResult) => void) => void;
        select(window, null, (_source, result) => {
            try {
                const path = dialog.select_folder_finish(result)?.get_path();
                if (path) settings.set_strv('dock-stacks', withStack(settings.get_strv('dock-stacks'), path));
            } catch {
                // Cancelled.
            }
        });
    });
    const view = comboRow(settings, 'dock-downloads-view', _('Show stacks as'), [
        ['automatic', _('Automatic')],
        ['fan', _('Fan')],
        ['grid', _('Grid')],
    ]);
    const refresh = () => {
        for (const row of [...folderRows, addRow, view]) if (row.get_parent()) box.remove(row);
        folderRows = settings.get_strv('dock-stacks').map((path) => {
            const row = new Adw.ActionRow({ title: GLib.filename_display_basename(path), subtitle: homeRelative(path) });
            row.add_prefix(new Gtk.Image({ icon_name: 'folder-symbolic' }));
            const remove = new Gtk.Button({ icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _('Remove from Dock'), css_classes: ['flat'] });
            remove.connect('clicked', () => settings.set_strv('dock-stacks', settings.get_strv('dock-stacks').filter((p) => p !== path)));
            row.add_suffix(remove);
            return row;
        });
        for (const row of [...folderRows, addRow, view]) box.add(row);
    };
    refresh();
    const id = settings.connect('changed::dock-stacks', refresh);
    onClose(() => settings.disconnect(id));
    return box;
}

/**
 * Widgets on the desktop: the switch, one switch per widget and a button
 * that puts dragged widgets back in their column.
 */
function widgetsRow(settings: Gio.Settings): Gtk.Widget {
    const expander = new Adw.ExpanderRow({
        title: _('Widgets on the desktop'),
        subtitle: _('Drag them anywhere; click one to open its app'),
        show_enable_switch: true,
    });
    settings.bind('desktop-widgets-enabled', expander, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
    const choices: [string, string][] = [
        ['clock', _('Clock')],
        ['calendar', _('Calendar')],
        ['weather', _('Weather')],
        ['batteries', _('Batteries')],
        ['photos', _('Photos')],
    ];
    const rows = choices.map(([id, title]) => {
        const row = new Adw.SwitchRow({ title });
        row.connect('notify::active', () => {
            const list = settings.get_strv('desktop-widgets');
            if (row.active === list.includes(id)) return;
            // Keep the widgets in the order they are listed here.
            const wanted = row.active ? [...list, id] : list.filter((name) => name !== id);
            settings.set_strv('desktop-widgets', choices.map(([name]) => name).filter((name) => wanted.includes(name)));
        });
        expander.add_row(row);
        return [id, row] as const;
    });
    const sync = () => {
        const list = settings.get_strv('desktop-widgets');
        for (const [id, row] of rows) row.active = list.includes(id);
    };
    sync();
    const reset = new Adw.ActionRow({ title: _('Put widgets back in their column') });
    const button = new Gtk.Button({ label: _('Reset'), valign: Gtk.Align.CENTER });
    button.connect('clicked', () => settings.reset('desktop-widget-positions'));
    reset.add_suffix(button);
    expander.add_row(reset);
    const id = settings.connect('changed::desktop-widgets', sync);
    expander.connect('destroy', () => settings.disconnect(id));
    return expander;
}

/** A path for reading: ~ for the home folder. */
function homeRelative(path: string): string {
    const home = GLib.get_home_dir();
    const shown = path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
    return GLib.filename_display_name(shown);
}

/**
 * Light, Dark or Auto, as in macOS. Light and Dark set GNOME's style (and the
 * light or dark variant of the GTK and shell themes); Auto leaves it to Macr.
 */
function appearanceRow(settings: Gio.Settings): Gtk.Widget {
    const desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    const zorinSchema = Gio.SettingsSchemaSource.get_default()?.lookup('com.zorin.desktop.auto-theme', true);
    const zorin = zorinSchema ? new Gio.Settings({ settings_schema: zorinSchema }) : null;
    const row = new Adw.ActionRow({ title: _('Appearance') });
    const box = new Gtk.Box({ valign: Gtk.Align.CENTER, css_classes: ['linked'] });
    const choices: [string, string][] = [
        ['light', _('Light')],
        ['dark', _('Dark')],
        ['auto', _('Auto')],
    ];
    const current = () => (settings.get_boolean('appearance-auto') ? 'auto' : desktop.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light');
    const buttons = new Map<string, Gtk.ToggleButton>();
    let first: Gtk.ToggleButton | null = null;
    for (const [value, label] of choices) {
        const button = new Gtk.ToggleButton({ label, valign: Gtk.Align.CENTER });
        if (first) button.set_group(first);
        else first = button;
        button.connect('toggled', () => {
            if (!button.active || current() === value) return;
            if (value === 'auto') {
                // Applied now, whatever was last applied.
                settings.set_string('appearance-auto-phase', '');
                settings.set_boolean('appearance-auto', true);
            } else {
                settings.set_boolean('appearance-auto', false);
                setAppearance(value === 'dark');
            }
        });
        buttons.set(value, button);
        box.append(button);
    }
    const sync = () => {
        const value = current();
        const button = buttons.get(value);
        if (button && !button.active) button.active = true;
        if (value === 'auto' && zorin?.get_boolean('enabled')) row.subtitle = _('Zorin’s own automatic theme is on too: turn one of them off');
        else if (value === 'auto') row.subtitle = _('Light during the day, dark at night');
        else row.subtitle = '';
    };
    sync();
    const ids: [Gio.Settings, number][] = [
        [settings, settings.connect('changed::appearance-auto', sync)],
        [desktop, desktop.connect('changed::color-scheme', sync)],
    ];
    if (zorin) ids.push([zorin, zorin.connect('changed::enabled', sync)]);
    row.connect('destroy', () => {
        for (const [target, id] of ids) target.disconnect(id);
    });
    row.add_suffix(box);
    return row;
}

/** The accent colours as round swatches, as in macOS: the chosen one's name under the title. */
function accentRow(settings: Gio.Settings): Gtk.Widget {
    const choices: [string, string][] = [
        ['wallpaper', _('Wallpaper')],
        ['blue', _('Blue')],
        ['purple', _('Purple')],
        ['pink', _('Pink')],
        ['red', _('Red')],
        ['orange', _('Orange')],
        ['yellow', _('Yellow')],
        ['green', _('Green')],
        ['graphite', _('Graphite')],
    ];
    const row = new Adw.ActionRow({ title: _('Accent colour'), tooltip_text: _('Highlighted menu items, default buttons and active toggles in Macr') });
    const box = new Gtk.Box({ spacing: 10, valign: Gtk.Align.CENTER, css_classes: ['macr-swatches'] });
    const buttons = new Map<string, Gtk.ToggleButton>();
    let group: Gtk.ToggleButton | null = null;
    for (const [value, label] of choices) {
        const button = new Gtk.ToggleButton({ tooltip_text: label, valign: Gtk.Align.CENTER, css_classes: ['macr-swatch', value] });
        button.update_property([Gtk.AccessibleProperty.LABEL], [label]);
        if (group) button.set_group(group);
        else group = button;
        button.connect('toggled', () => {
            if (button.active && settings.get_string('accent-color') !== value) settings.set_string('accent-color', value);
        });
        buttons.set(value, button);
        box.append(button);
    }
    const sync = () => {
        const value = settings.get_string('accent-color');
        const button = buttons.get(value);
        if (button && !button.active) button.active = true;
        row.subtitle = choices.find(([choice]) => choice === value)?.[1] ?? '';
    };
    sync();
    const id = settings.connect('changed::accent-color', sync);
    row.connect('destroy', () => settings.disconnect(id));
    row.add_suffix(box);
    return row;
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
