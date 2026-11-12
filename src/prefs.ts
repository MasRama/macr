import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/** The settings window. GNOME runs it in its own process, never inside the shell. */
export default class MacrPreferences extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: _('Menu Bar') });
        group.add(switchRow(settings, 'menubar-enabled', _('macOS menu bar'), _('Logo menu, app menu, Window menu and clock in the top bar')));
        group.add(switchRow(settings, 'hide-distro-menu-button', _('Hide the distribution menu button'), _('Such as Zorin Menu. The Super key keeps opening it.')));
        page.add(group);
        window.add(page);
    }
}

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle: string): Adw.SwitchRow {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}
