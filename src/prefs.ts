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
        group.add(switchRow(settings, 'menubar-all-monitors', _('On every monitor'), _('Off shows it on the primary monitor only')));
        group.add(switchRow(settings, 'hide-distro-menu-button', _('Hide the distribution menu button'), _('Such as Zorin Menu. The Super key keeps opening it.')));
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
        window.add(page);
    }
}

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle: string): Adw.SwitchRow {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}
