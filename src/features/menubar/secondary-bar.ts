import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { isLight } from '../../shared/scheme.js';
import { AppMenu } from './app-menu.js';
import { Clock } from './clock.js';
import type { FocusTracker } from './focus.js';
import { logoMenu } from './logo-menu.js';
import { StatusMirror } from './status-mirror.js';
import { windowMenu } from './window-menu.js';

type Disconnectable = { disconnect(id: number): void };

/**
 * The menu bar on a monitor that has no GNOME top bar: the same logo, app
 * and Window menus and clock, plus live copies of the main bar's status and
 * app tray icons that act on the real ones. It reserves its height like the
 * top bar and hides over full-screen windows.
 */
export class SecondaryBar {
    readonly appMenu: AppMenu;
    private readonly actor: St.BoxLayout;
    private readonly menus: PopupMenu.PopupMenuManager;
    private readonly buttons: PanelMenu.Button[];
    private readonly status: StatusMirror;
    private readonly clock: Clock;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [Disconnectable, number][] = [];

    constructor(monitorIndex: number, focus: FocusTracker) {
        // Named like the top bar so the shell theme and Macr's bar style apply.
        this.actor = new St.BoxLayout({ name: 'panel', style_class: 'macr-bar macr-secondary-bar', reactive: true });
        this.actor.add_effect_with_name('macr-blur', new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.9 }));
        const left = new St.BoxLayout({ x_expand: true });
        const right = new St.BoxLayout();
        this.actor.add_child(left);
        this.actor.add_child(right);
        this.menus = new PopupMenu.PopupMenuManager(this.actor, {});

        this.appMenu = new AppMenu(focus);
        this.buttons = [logoMenu(), this.appMenu.button, windowMenu(focus)];
        for (const button of this.buttons) {
            left.add_child(button.container);
            if (button.menu) this.menus.addMenu(button.menu as PopupMenu.PopupMenu, -1);
        }

        this.status = new StatusMirror();
        right.add_child(this.status.actor);
        this.clock = new Clock();
        right.add_child(this.clock.button.container);

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true, trackFullscreen: true });
        const monitor = Main.layoutManager.monitors[monitorIndex];
        this.actor.set_position(monitor.x, monitor.y);
        this.actor.width = monitor.width;

        this.ids.push([this.interface, this.interface.connect('changed::color-scheme', () => this.syncScheme())]);
        this.syncScheme();
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        this.clock.destroy();
        this.status.destroy();
        for (const button of this.buttons) button.destroy();
        this.actor.destroy();
    }

    private syncScheme(): void {
        if (isLight()) this.actor.add_style_class_name('macr-light');
        else this.actor.remove_style_class_name('macr-light');
    }
}
