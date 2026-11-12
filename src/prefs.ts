import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/** The settings window. GNOME runs it in its own process, never inside the shell. */
export default class MacrPreferences extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: _('Menu Bar') });
        group.add(switchRow(settings, 'menubar-enabled', _('macOS menu bar'), _('Logo menu, app menu, Window menu and clock in the top bar')));
        group.add(switchRow(settings, 'menubar-app-menus', _('App menus'), _('The focused app’s own File, Edit and View menus, when the app shares them')));
        group.add(switchRow(settings, 'menubar-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')));
        group.add(switchRow(settings, 'hide-distro-menu-button', _('Hide the distribution menu button'), _('Such as Zorin Menu')));
        page.add(group);

        const dock = new Adw.PreferencesGroup({ title: _('Dock') });
        dock.add(switchRow(settings, 'dock-enabled', _('macOS dock'), _('Replaces Dash to Dock and the overview’s dash')));
        const size = new Adw.SpinRow({
            title: _('Icon size'),
            subtitle: _('In pixels, before magnification'),
            adjustment: new Gtk.Adjustment({ lower: 32, upper: 96, step_increment: 4, page_increment: 8 }),
        });
        settings.bind('dock-icon-size', size, 'value', Gio.SettingsBindFlags.DEFAULT);
        const rows = [
            switchRow(settings, 'dock-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')),
            size,
            switchRow(settings, 'dock-magnification', _('Magnification'), _('Icons grow under the pointer')),
            switchRow(settings, 'dock-autohide', _('Hide when a window covers it'), _('Push the pointer to the bottom edge to show it again')),
            switchRow(settings, 'dock-genie', _('Genie minimize'), _('Windows pour into their dock icon')),
        ];
        for (const row of rows) {
            settings.bind('dock-enabled', row, 'sensitive', Gio.SettingsBindFlags.GET);
            dock.add(row);
        }
        page.add(dock);

        const apps = new Adw.PreferencesGroup({ title: _('Launchpad and Spotlight') });
        apps.add(switchRow(settings, 'launchpad-enabled', _('Launchpad'), _('Every app in a full-screen grid, from the dock’s Apps icon')));
        const superKey = switchRow(settings, 'launchpad-super-key', _('Super key opens Launchpad'), _('Instead of the overview or the distribution’s app menu'));
        settings.bind('launchpad-enabled', superKey, 'sensitive', Gio.SettingsBindFlags.GET);
        apps.add(superKey);
        apps.add(switchRow(settings, 'spotlight-enabled', _('Spotlight'), _('Search apps, files and settings with Ctrl+Space')));
        page.add(apps);

        const center = new Adw.PreferencesGroup({ title: _('Control Center') });
        center.add(switchRow(settings, 'control-center-enabled', _('macOS Control Center'), _('Quick settings with Focus, titled sliders and macOS tiles')));
        page.add(center);

        const icons = new Adw.PreferencesGroup({ title: _('App icons') });
        icons.add(switchRow(settings, 'app-icon-tiles', _('macOS tiles for other icons'), _('Apps your icon theme does not cover get their icon on a macOS tile')));
        page.add(icons);

        const osd = new Adw.PreferencesGroup({ title: _('On-screen display') });
        osd.add(switchRow(settings, 'osd-enabled', _('macOS volume and brightness'), _('A small pill under the menu bar at the top right')));
        page.add(osd);

        const switcher = new Adw.PreferencesGroup({ title: _('App switcher') });
        switcher.add(switchRow(settings, 'switcher-enabled', _('macOS app switcher'), _('Alt+Tab as a frosted panel with big icons')));
        page.add(switcher);

        const notifications = new Adw.PreferencesGroup({ title: _('Notifications') });
        notifications.add(switchRow(settings, 'notifications-enabled', _('macOS notifications'), _('Banners at the top right and a macOS Notification Center on the clock')));
        page.add(notifications);

        const spaces = new Adw.PreferencesGroup({ title: _('Mission Control') });
        spaces.add(switchRow(settings, 'mission-control-enabled', _('macOS Mission Control'), _('Windows over the dimmed wallpaper, Spaces always at the top')));
        spaces.add(switchRow(settings, 'hot-corners-enabled', _('Hot corners'), _('Push the pointer into a screen corner')));
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
        for (const [key, title] of corners) {
            const row = comboRow(settings, key, title, actions);
            settings.bind('hot-corners-enabled', row, 'sensitive', Gio.SettingsBindFlags.GET);
            spaces.add(row);
        }
        page.add(spaces);

        const windows = new Adw.PreferencesGroup({ title: _('Windows') });
        windows.add(switchRow(settings, 'window-corners-enabled', _('Rounded corners'), _('For apps that do not round their own, such as Qt and Electron apps')));
        const radius = new Adw.SpinRow({
            title: _('Corner radius'),
            subtitle: _('In pixels'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 32, step_increment: 1, page_increment: 4 }),
        });
        settings.bind('window-corner-radius', radius, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('window-corners-enabled', radius, 'sensitive', Gio.SettingsBindFlags.GET);
        windows.add(radius);
        page.add(windows);
        window.add(page);
    }
}

/** A drop-down for a string setting with fixed choices: [value, label] pairs. */
function comboRow(settings: Gio.Settings, key: string, title: string, choices: [string, string][]): Adw.ComboRow {
    const row = new Adw.ComboRow({ title, model: Gtk.StringList.new(choices.map(([, label]) => label)) });
    const sync = () => {
        const index = choices.findIndex(([value]) => value === settings.get_string(key));
        if (index >= 0 && row.selected !== index) row.selected = index;
    };
    sync();
    settings.connect(`changed::${key}`, sync);
    row.connect('notify::selected', () => {
        const choice = choices[row.selected];
        if (choice && choice[0] !== settings.get_string(key)) settings.set_string(key, choice[0]);
    });
    return row;
}

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle: string): Adw.SwitchRow {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}
