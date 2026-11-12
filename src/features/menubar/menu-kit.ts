import type Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';

type Connectable = { connect(signal: string, callback: (...args: never[]) => void): number };
export type MenuLike = { addMenuItem(item: PopupMenu.PopupMenuBase.MenuItemType): void };

/** A panel button whose menu wears Macr's style and is rebuilt each time it opens. */
export function menuButton(name: string, child: Clutter.Actor, build: (menu: PopupMenu.PopupMenu) => void): PanelMenu.Button {
    const button = new PanelMenu.Button(0.0, name, false);
    button.add_style_class_name('macr-menu-button');
    button.add_child(child);
    const menu = button.menu as PopupMenu.PopupMenu;
    styleMenu(menu);
    (menu as unknown as Connectable).connect('open-state-changed', (_menu: unknown, open: boolean) => {
        if (!open) return;
        syncMenuScheme(menu);
        menu.removeAll();
        build(menu);
    });
    // A menu with no items never opens, so give it one before the first click.
    build(menu);
    return button;
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
