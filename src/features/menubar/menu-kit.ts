import type Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

type Connectable = { connect(signal: string, callback: (...args: never[]) => void): number };
export type MenuLike = { addMenuItem(item: PopupMenu.PopupMenuBase.MenuItemType): void };

/** A panel button whose menu wears Macr's style and is rebuilt each time it opens. */
export function menuButton(name: string, child: Clutter.Actor, build: (menu: PopupMenu.PopupMenu) => void): PanelMenu.Button {
    const button = new PanelMenu.Button(0.0, name, false);
    button.add_style_class_name('macr-menu-button');
    button.add_child(child);
    const menu = button.menu as PopupMenu.PopupMenu;
    menu.actor.add_style_class_name('macr-menu');
    menu.box.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
    (menu as unknown as Connectable).connect('open-state-changed', (_menu: unknown, open: boolean) => {
        if (!open) return;
        if (isLight()) menu.actor.add_style_class_name('macr-light');
        else menu.actor.remove_style_class_name('macr-light');
        menu.removeAll();
        build(menu);
    });
    // A menu with no items never opens, so give it one before the first click.
    build(menu);
    return button;
}

let interfaceSettings: Gio.Settings | null = null;

/** Menus follow the light or dark style, like the bar. */
export function isLight(): boolean {
    interfaceSettings ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    return interfaceSettings.get_string('color-scheme') !== 'prefer-dark';
}

/** Style classes for a Macr dialog in the current light or dark style. */
export function dialogClass(classes: string): string {
    return isLight() ? `${classes} macr-light` : classes;
}

export function item(menu: MenuLike, label: string, activate: () => void, sensitive = true): PopupMenu.PopupMenuItem {
    const entry = new PopupMenu.PopupMenuItem(label);
    entry.connect('activate', () => activate());
    entry.setSensitive(sensitive);
    menu.addMenuItem(entry);
    return entry;
}

export function separator(menu: MenuLike): void {
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
}

/** Adds groups of items with one separator between non-empty groups. */
export function groups(menu: MenuLike, ...fills: ((menu: MenuLike) => void)[]): void {
    let first = true;
    for (const fill of fills) {
        const section = new PopupMenu.PopupMenuSection();
        fill(section);
        if (section.isEmpty()) {
            section.destroy();
            continue;
        }
        if (!first) separator(menu);
        menu.addMenuItem(section);
        first = false;
    }
}

export function submenu(menu: MenuLike, label: string): PopupMenu.PopupSubMenuMenuItem {
    const entry = new PopupMenu.PopupSubMenuMenuItem(label);
    menu.addMenuItem(entry);
    return entry;
}

/** Opens an app by its desktop file; false when it is not installed. */
export function launchApp(desktopId: string): boolean {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app) return false;
    app.activate();
    return true;
}
