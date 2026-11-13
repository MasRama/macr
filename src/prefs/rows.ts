import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

/** A switch bound to a boolean setting. */
export function switchRow(settings: Gio.Settings, key: string, title: string, subtitle: string): Adw.SwitchRow {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** A number field bound to an integer setting. */
export function spinRow(settings: Gio.Settings, key: string, title: string, subtitle: string, lower: number, upper: number, step: number): Adw.SpinRow {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: step * 4 }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** A drop-down for a string setting with fixed choices: [value, label] pairs. */
export function comboRow(settings: Gio.Settings, key: string, title: string, choices: [string, string][]): Adw.ComboRow {
    const row = new Adw.ComboRow({ title, model: Gtk.StringList.new(choices.map(([, label]) => label)) });
    const sync = () => {
        const index = choices.findIndex(([value]) => value === settings.get_string(key));
        if (index >= 0 && row.selected !== index) row.selected = index;
    };
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    row.connect('destroy', () => settings.disconnect(id));
    row.connect('notify::selected', () => {
        const choice = choices[row.selected];
        if (choice && choice[0] !== settings.get_string(key)) settings.set_string(key, choice[0]);
    });
    return row;
}

/** Greys the rows out while the boolean setting `key` is off. */
export function dependsOn(settings: Gio.Settings, key: string, ...rows: Gtk.Widget[]): void {
    for (const row of rows) settings.bind(key, row, 'sensitive', Gio.SettingsBindFlags.GET);
}

/** A group with the given rows. */
export function group(title: string, rows: Gtk.Widget[], description?: string): Adw.PreferencesGroup {
    const box = new Adw.PreferencesGroup({ title });
    if (description) box.description = description;
    for (const row of rows) box.add(row);
    return box;
}
