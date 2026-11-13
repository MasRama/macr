import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { DesktopReveal } from '../../shared/desktop-reveal.js';
import { isClick, type Press } from './logic/click.js';

/**
 * A desktop-icons window (DING and its forks): below everything, out of
 * the taskbar. A click on it cannot be told from a click on an icon, so
 * clicking an icon reveals the desktop too.
 */
function isDesktopWindow(window: Meta.Window | null): boolean {
    if (!window) return false;
    return window.get_window_type() === Meta.WindowType.DESKTOP || (window.skip_taskbar && window.get_layer() === Meta.StackLayer.BOTTOM);
}

/** Whether `actor` is the wallpaper, or the desktop-icons window over it. */
function isWallpaper(actor: Clutter.Actor | null): boolean {
    for (let a = actor; a; a = a.get_parent()) {
        if (a instanceof Meta.BackgroundActor) return true;
        if (a instanceof Meta.WindowActor) return isDesktopWindow(a.get_meta_window());
    }
    return false;
}

/**
 * Click the wallpaper to reveal the desktop, as on macOS: the windows
 * slide aside, and a click on the wallpaper (or a window's sliver) brings
 * them back. Only a plain left click on the desktop counts, never a drag.
 */
export class WallpaperClick {
    private readonly filterId: number;
    private press: Press | null = null;

    constructor(private readonly reveal: DesktopReveal) {
        this.filterId = Clutter.Event.add_filter(global.stage as Clutter.Stage, (event: Clutter.Event, actor: Clutter.Actor) => this.handle(event, actor));
    }

    destroy(): void {
        Clutter.Event.remove_filter(this.filterId);
    }

    private handle(event: Clutter.Event, actor: Clutter.Actor | null): boolean {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.BUTTON_RELEASE) return Clutter.EVENT_PROPAGATE;
        if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const here = { x, y, t: event.get_time() };
        const onWallpaper = (Main.actionMode as Shell.ActionMode) === Shell.ActionMode.NORMAL && isWallpaper(actor);
        if (type === Clutter.EventType.BUTTON_PRESS) {
            this.press = onWallpaper ? here : null;
            return Clutter.EVENT_PROPAGATE;
        }
        const press = this.press;
        this.press = null;
        if (press && onWallpaper && isClick(press, here)) this.reveal.toggle();
        return Clutter.EVENT_PROPAGATE;
    }
}
