import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { themeCandidates } from '../features/appearance/logic/appearance.js';

const USER_THEME = 'org.gnome.shell.extensions.user-theme';

/** Whether theme `name` is installed with a `part` folder (gtk-3.0, gnome-shell). */
function themeInstalled(name: string, part: string): boolean {
    const roots = [
        GLib.build_filenamev([GLib.get_home_dir(), '.themes']),
        GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']),
        ...GLib.get_system_data_dirs().map((dir) => GLib.build_filenamev([dir, 'themes'])),
    ];
    return roots.some((root) => GLib.file_test(GLib.build_filenamev([root, name, part]), GLib.FileTest.IS_DIR));
}

/** Points `key` at the light or dark variant of its theme, when that is installed. */
function swapTheme(settings: Gio.Settings, key: string, dark: boolean, part: string): void {
    const name = settings.get_string(key);
    const other = themeCandidates(name, dark).find((candidate) => themeInstalled(candidate, part));
    if (other) settings.set_string(key, other);
}

/**
 * Turns the desktop light or dark: GNOME's style, and the GTK and shell
 * themes when they come in a light and a dark variant (MacTahoe-Light and
 * MacTahoe-Dark, ZorinBlue-Light and ZorinBlue-Dark).
 */
export function setAppearance(dark: boolean): void {
    const desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    desktop.set_string('color-scheme', dark ? 'prefer-dark' : 'default');
    swapTheme(desktop, 'gtk-theme', dark, 'gtk-3.0');
    const schema = Gio.SettingsSchemaSource.get_default()?.lookup(USER_THEME, true);
    if (schema) swapTheme(new Gio.Settings({ settings_schema: schema }), 'name', dark, 'gnome-shell');
}
