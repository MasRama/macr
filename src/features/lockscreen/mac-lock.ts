import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import type AccountsService from 'gi://AccountsService';
import type { UnlockDialog } from 'resource:///org/gnome/shell/ui/unlockDialog.js';
import * as UserWidget from 'resource:///org/gnome/shell/ui/userWidget.js';

import { LOCK_DATE_FORMAT, lockTimeFormat } from './logic/clock.js';
import { lockLayout, type Box } from './logic/layout.js';

type Sized = Clutter.Actor;

function size(actor: Sized): [number, number] {
    const [, , width, height] = actor.get_preferred_size();
    return [width, height];
}

function allocate(actor: Sized, box: Box): void {
    actor.allocate(new Clutter.ActorBox({ x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 }));
}

/** Places the parts of a macOS lock screen; see logic/layout.ts. */
const MacLockLayout = GObject.registerClass(
    class MacLockLayout extends Clutter.LayoutManager {
        clock!: Sized;
        prompt!: Sized;
        notifications!: Sized;
        buttons!: Sized;

        override vfunc_get_preferred_width(_container: Clutter.Actor, forHeight: number): [number, number] {
            return this.prompt.get_preferred_width(forHeight);
        }

        override vfunc_get_preferred_height(_container: Clutter.Actor, forWidth: number): [number, number] {
            return this.prompt.get_preferred_height(forWidth);
        }

        override vfunc_allocate(_container: Clutter.Actor, box: Clutter.ActorBox): void {
            const [width, height] = box.get_size();
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            const boxes = lockLayout(width, height, {
                clock: size(this.clock),
                notifications: size(this.notifications),
                prompt: size(this.prompt),
                buttons: this.buttons.visible ? size(this.buttons) : null,
            }, scale);
            allocate(this.clock, boxes.clock);
            allocate(this.notifications, boxes.notifications);
            allocate(this.prompt, boxes.prompt);
            if (boxes.buttons) allocate(this.buttons, boxes.buttons);
        }
    });

type Disconnectable = { disconnect(id: number): void };

/**
 * One GNOME unlock dialog turned into the macOS lock screen: the date and a
 * big time stay at the top the whole time, the user's avatar and name sit
 * low in the middle, and the password field fades in under them on a key
 * press or click instead of replacing the clock. The wallpaper is shown as
 * it is, only a little darker, not blurred.
 */
export class MacLock {
    private readonly card: St.BoxLayout;
    private readonly mainBox: Clutter.Actor;
    private readonly gnomeLayout: Clutter.LayoutManager | null;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [Disconnectable, number][] = [];

    constructor(private readonly dialog: UnlockDialog) {
        const clock = dialog._clock;
        const stack = dialog._stack;
        this.mainBox = stack.get_parent()!;
        this.gnomeLayout = this.mainBox.layout_manager;

        dialog.add_style_class_name('macr-lock');
        // The clock leaves the stack it shared with the prompt, so it stays.
        stack.remove_child(clock);
        this.mainBox.add_child(clock);
        clock.set_child_below_sibling(clock._date, clock._time);
        clock._hint.visible = false;

        // Avatar and name while the password field is hidden; the prompt
        // shows the same widget in the same place once it fades in.
        const User = UserWidget.UserWidget as unknown as new (user: AccountsService.User, orientation: Clutter.Orientation) => St.BoxLayout;
        this.card = new User(dialog._user, Clutter.Orientation.VERTICAL);
        this.card.add_style_class_name('macr-lock-user');
        stack.add_child(this.card);

        const layout = new MacLockLayout();
        layout.clock = clock;
        layout.prompt = stack;
        layout.notifications = dialog._notificationsBox;
        layout.buttons = dialog._menuButtons;
        this.mainBox.layout_manager = layout;

        this.ids.push([clock._wallClock, clock._wallClock.connect('notify::clock', () => this.updateClock())]);
        this.ids.push([this.interface, this.interface.connect('changed::clock-format', () => this.updateClock())]);
        this.updateClock();
        this.transition(0);
        this.updateBackground();
    }

    /** GNOME's _setTransitionProgress: 0 shows the user, 1 the password. */
    transition(progress: number): void {
        const { dialog, card } = this;
        dialog._promptBox.visible = progress > 0;
        card.visible = progress < 1;
        dialog._otherUserButton.set({ reactive: progress > 0, can_focus: progress > 0 });
        dialog._promptBox.set({ opacity: 255 * progress, scale_x: 1, scale_y: 1, translation_y: 0 });
        card.opacity = 255 * (1 - progress);
        dialog._clock.set({ visible: true, opacity: 255, scale_x: 1, scale_y: 1, translation_y: 0 });
        dialog._menuButtons.set({ opacity: 255 * progress, scale_x: 1, scale_y: 1 });
    }

    /** Run after GNOME's _updateBackgroundEffects. */
    updateBackground(): void {
        for (const widget of this.dialog._backgroundGroup.get_children()) {
            const effect = widget.get_effect('blur') as (Clutter.Effect & { radius: number; brightness: number }) | null;
            if (effect) effect.set({ radius: 0, brightness: 0.82 });
        }
    }

    private updateClock(): void {
        const now = GLib.DateTime.new_now_local();
        const clock = this.dialog._clock;
        clock._time.text = now.format(lockTimeFormat(this.interface.get_string('clock-format') === '24h')) ?? '';
        clock._date.text = now.format(LOCK_DATE_FORMAT) ?? '';
    }

    /** Puts GNOME's dialog back as it was; GNOME's methods are back by now. */
    undo(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        const { dialog } = this;
        const clock = dialog._clock;
        if (this.gnomeLayout) this.mainBox.layout_manager = this.gnomeLayout;
        this.card.destroy();
        this.mainBox.remove_child(clock);
        dialog._stack.add_child(clock);
        clock.set_child_above_sibling(clock._date, clock._time);
        clock._hint.visible = true;
        (clock as unknown as { _updateClock(): void })._updateClock();
        dialog.remove_style_class_name('macr-lock');
        dialog._updateBackgroundEffects();
        dialog._setTransitionProgress((dialog as unknown as { _adjustment: St.Adjustment })._adjustment.value);
    }
}
