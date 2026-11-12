import Shell from 'gi://Shell';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { isLight } from './scheme.js';

/** Gives a popup menu Macr's frosted-glass style. Safe to call more than once. */
export function styleMenu(menu: PopupMenu.PopupMenu): void {
    if (menu.actor.has_style_class_name('macr-menu')) return;
    menu.actor.add_style_class_name('macr-menu');
    menu.box.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
}

/** Matches a styled menu to GNOME's light or dark style; call it as the menu opens. */
export function syncMenuScheme(menu: PopupMenu.PopupMenu): void {
    if (isLight()) menu.actor.add_style_class_name('macr-light');
    else menu.actor.remove_style_class_name('macr-light');
}
