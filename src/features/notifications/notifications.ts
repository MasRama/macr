import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import { NotificationStacks } from './stacks.js';

const BLUR = 'macr-notifications-blur';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
/** GNOME 46's message tray: the banners' container is `_bannerBin`. */
type MessageTray = St.Widget & { bannerAlignment: Clutter.ActorAlign; _bannerBin: St.Widget };
/** The hidden dateMenu's popover: calendar and the notification list. */
type DateMenu = { menu: Signals & { actor: St.Widget; box: St.Widget } };

/**
 * GNOME's notifications the macOS way: banners as frosted cards at the top
 * right, and the clock's calendar and notification list as the macOS
 * Notification Center. GNOME's message tray, list and Do Not Disturb do all
 * the work; the look is in the stylesheet under `macr-notifications` (the
 * banners) and `macr-nc` (the popover), and each app's notifications stack
 * (`NotificationStacks`). Everything is put back on destroy.
 */
export class Notifications {
    private readonly tray = Main.messageTray as unknown as MessageTray;
    private readonly menu = (Main.panel.statusArea.dateMenu as unknown as DateMenu).menu;
    private readonly alignment: Clutter.ActorAlign;
    private readonly ids: [Signals, number][] = [];
    private readonly stacks: NotificationStacks;

    constructor() {
        this.alignment = this.tray.bannerAlignment;
        this.tray.bannerAlignment = Clutter.ActorAlign.END;
        this.tray.add_style_class_name('macr-notifications');
        this.syncScheme(this.tray);
        for (const banner of this.tray._bannerBin.get_children()) blur(banner);
        this.connect(this.tray._bannerBin, 'child-added', (_bin: Clutter.Actor, banner: Clutter.Actor) => {
            this.syncScheme(this.tray);
            blur(banner);
        });

        this.menu.actor.add_style_class_name('macr-nc');
        this.menu.box.add_effect_with_name(BLUR, newBlur());
        this.syncScheme(this.menu.actor);
        this.connect(this.menu, 'open-state-changed', (_menu: unknown, open: boolean) => {
            if (open) this.syncScheme(this.menu.actor);
        });
        this.stacks = new NotificationStacks(this.menu);
    }

    destroy(): void {
        this.stacks.destroy();
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;

        this.tray.bannerAlignment = this.alignment;
        this.tray.remove_style_class_name('macr-notifications');
        this.tray.remove_style_class_name('macr-light');
        for (const banner of this.tray._bannerBin.get_children()) banner.remove_effect_by_name(BLUR);

        this.menu.actor.remove_style_class_name('macr-nc');
        this.menu.actor.remove_style_class_name('macr-light');
        this.menu.box.remove_effect_by_name(BLUR);
    }

    private connect(object: Signals | Clutter.Actor, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }

    private syncScheme(actor: St.Widget): void {
        if (isLight()) actor.add_style_class_name('macr-light');
        else actor.remove_style_class_name('macr-light');
    }
}

function newBlur(): Shell.BlurEffect {
    return new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 });
}

function blur(banner: Clutter.Actor): void {
    if (!banner.get_effect(BLUR)) banner.add_effect_with_name(BLUR, newBlur());
}
