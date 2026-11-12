import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import GObject from 'gi://GObject';
import St from 'gi://St';
import type { LoginDialog, UserList, UserListItem } from 'resource:///org/gnome/shell/gdm/loginDialog.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

import { LOCK_DATE_FORMAT, lockTimeFormat } from '../lockscreen/logic/clock.js';
import { loginLayout } from './logic/layout.js';

function size(actor: Clutter.Actor): [number, number] {
    const [, , width, height] = actor.get_preferred_size();
    return [width, height];
}

function scaleFactor(): number {
    return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
}

/** Puts the clock where loginLayout wants it, on a monitor-sized actor. */
const ClockSpot = GObject.registerClass(
    class ClockSpot extends Clutter.LayoutManager {
        clock!: Clutter.Actor;

        override vfunc_get_preferred_width(): [number, number] {
            return [0, 0];
        }

        override vfunc_get_preferred_height(): [number, number] {
            return [0, 0];
        }

        override vfunc_allocate(_container: Clutter.Actor, box: Clutter.ActorBox): void {
            const [width, height] = box.get_size();
            const { clock } = loginLayout(width, height, { clock: size(this.clock), users: [0, 0], prompt: [0, 0] }, scaleFactor());
            this.clock.allocate(new Clutter.ActorBox({ x1: clock.x1, y1: clock.y1, x2: clock.x2, y2: clock.y2 }));
        }
    });

type Disconnectable = { disconnect(id: number): void };
type Placer = LoginDialog['_getCenterActorAllocation'];

/**
 * GNOME's login dialog turned into the macOS login screen, the lock screen's
 * twin: the date and a big time at the top, the users side by side low in
 * the middle, each with the avatar over the name, and the password field
 * under the chosen one. GNOME keeps its own layout; only the two boxes it
 * centres (user list and prompt) are placed lower.
 */
export class MacLogin {
    private readonly overlay: St.Widget;
    private readonly clock: St.BoxLayout;
    private readonly date: St.Label;
    private readonly time: St.Label;
    private readonly wallClock = new GnomeDesktop.WallClock();
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [Disconnectable, number][] = [];
    private readonly items = new Set<UserListItem>();
    private readonly logoShown: boolean;

    constructor(private readonly dialog: LoginDialog) {
        dialog.add_style_class_name('macr-login');

        this.date = new St.Label({ style_class: 'unlock-dialog-clock-date', x_align: Clutter.ActorAlign.CENTER });
        this.time = new St.Label({ style_class: 'unlock-dialog-clock-time', x_align: Clutter.ActorAlign.CENTER });
        this.clock = new St.BoxLayout({ style_class: 'unlock-dialog-clock macr-login-clock', vertical: true });
        this.clock.add_child(this.date);
        this.clock.add_child(this.time);
        const spot = new ClockSpot();
        spot.clock = this.clock;
        this.overlay = new St.Widget({ layout_manager: spot });
        this.overlay.add_constraint(new Layout.MonitorConstraint({ primary: true }));
        this.overlay.add_child(this.clock);
        const parent = dialog.get_parent();
        parent?.insert_child_below(this.overlay, dialog);

        // No distribution logo at the bottom, as on a Mac.
        this.logoShown = dialog._logoBin.visible;
        dialog._logoBin.hide();

        // Users side by side, each avatar over its name.
        const list = dialog._userList;
        list._box.vertical = false;
        dialog._notListedButton.x_align = Clutter.ActorAlign.CENTER;
        for (const item of Object.values(list._items)) this.shape(item);
        const signals = list as unknown as { connect(signal: 'item-added', callback: (list: UserList, item: UserListItem) => void): number };
        this.ids.push([list, signals.connect('item-added', (_list, item) => this.shape(item))]);
        this.ids.push([list._box, list._box.connect('style-changed', () => this.fitList())]);
        this.fitList();

        // GNOME centres the list and the prompt; place them low instead.
        // (GNOME then grows the list's box evenly, and the list, aligned to
        // the centre, stays where it is placed.)
        const gnome: Placer = Object.getPrototypeOf(dialog)._getCenterActorAllocation;
        dialog._getCenterActorAllocation = (dialogBox, actor) => {
            const box = this.place(dialogBox, actor);
            return box ?? gnome.call(dialog, dialogBox, actor);
        };

        this.ids.push([this.wallClock, this.wallClock.connect('notify::clock', () => this.updateClock())]);
        this.ids.push([this.interface, this.interface.connect('changed::clock-format', () => this.updateClock())]);
        this.updateClock();
        dialog.queue_relayout();
    }

    private place(dialogBox: Clutter.ActorBox, actor: Clutter.Actor): Clutter.ActorBox | null {
        const { dialog } = this;
        if (actor !== dialog._authPrompt && actor !== dialog._userSelectionBox) return null;
        const [width, height] = dialogBox.get_size();
        const boxes = loginLayout(width, height, {
            clock: size(this.clock),
            users: size(dialog._userSelectionBox),
            prompt: size(dialog._authPrompt),
        }, scaleFactor());
        const box = { ...(actor === dialog._authPrompt ? boxes.prompt : boxes.users) };
        if (actor === dialog._userSelectionBox) {
            // The avatar in the list sits where the prompt shows it: the
            // list item's top padding goes above the line.
            const item = Object.values(dialog._userList._items)[0];
            const padding = item ? item.get_theme_node().get_padding(St.Side.TOP) : 0;
            box.y1 -= padding;
            box.y2 -= padding;
        }
        return new Clutter.ActorBox({
            x1: dialogBox.x1 + box.x1,
            y1: dialogBox.y1 + box.y1,
            x2: dialogBox.x1 + box.x2,
            y2: dialogBox.y1 + box.y2,
        });
    }

    /**
     * The theme gives the list a fixed width, which spreads a few users far
     * apart; it is as wide as its users instead, scrolling past most of the
     * screen.
     */
    private fitList(): void {
        const list = this.dialog._userList;
        const [, natural] = list._box.get_preferred_width(-1);
        const monitor = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        list.width = Math.min(natural, Math.round(monitor.width * 0.8));
    }

    private shape(item: UserListItem): void {
        if (this.items.has(item)) return;
        this.items.add(item);
        item.connect('destroy', () => {
            this.items.delete(item);
            this.fitList();
        });
        item.x_align = Clutter.ActorAlign.CENTER;
        const widget = item._userWidget;
        widget.vertical = true;
        widget.x_align = Clutter.ActorAlign.CENTER;
        widget.remove_style_class_name('horizontal');
        widget.add_style_class_name('vertical');
        this.fitList();
    }

    private unshape(item: UserListItem): void {
        item.x_align = Clutter.ActorAlign.FILL;
        const widget = item._userWidget;
        widget.vertical = false;
        widget.x_align = Clutter.ActorAlign.START;
        widget.remove_style_class_name('vertical');
        widget.add_style_class_name('horizontal');
    }

    private updateClock(): void {
        const now = GLib.DateTime.new_now_local();
        this.time.text = now.format(lockTimeFormat(this.interface.get_string('clock-format') === '24h')) ?? '';
        this.date.text = now.format(LOCK_DATE_FORMAT) ?? '';
    }

    /** Puts GNOME's dialog back as it was. */
    undo(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        const { dialog } = this;
        delete (dialog as Partial<Pick<LoginDialog, '_getCenterActorAllocation'>>)._getCenterActorAllocation;
        for (const item of this.items) this.unshape(item);
        this.items.clear();
        const list = dialog._userList;
        list._box.vertical = true;
        list.width = -1;
        dialog._notListedButton.x_align = Clutter.ActorAlign.START;
        if (this.logoShown) dialog._logoBin.show();
        this.overlay.destroy();
        dialog.remove_style_class_name('macr-login');
        dialog.queue_relayout();
    }
}
