import Gio from 'gi://Gio';

let interfaceSettings: Gio.Settings | null = null;

/** Macr's menus, dialogs and dock follow GNOME's light or dark style. */
export function isLight(): boolean {
    interfaceSettings ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    return interfaceSettings.get_string('color-scheme') !== 'prefer-dark';
}

/** Style classes for a Macr dialog in the current light or dark style. */
export function dialogClass(classes: string): string {
    return isLight() ? `${classes} macr-light` : classes;
}
