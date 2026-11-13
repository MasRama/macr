import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Editing } from '../../shared/editing.js';
import { newId } from '../../shared/logic/notes.js';
import { addReminder, parseReminders, type Reminder, remindersShown, removeReminder, serializeReminders } from './logic/reminders.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

const KEY = 'widget-reminders';
/** Milliseconds a ticked-off reminder stays, fading, before it goes. */
const TICK_DELAY = 1200;

/**
 * The macOS Reminders widget: a to-do list. Type in "New Reminder" and
 * press Enter to add one; a click on its circle ticks it off, and it fades
 * and goes after a moment. Kept in `widget-reminders`.
 */
export class RemindersWidget extends DesktopWidget {
    private readonly count: St.Label;
    private readonly list: St.BoxLayout;
    private readonly entry: St.Entry;
    private readonly editing: Editing;
    private readonly changedId: number;
    /** Ticked off, waiting to go: id → timeout. */
    private readonly ticked = new Map<string, number>();

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        const column = new St.BoxLayout({ style_class: 'macr-widget-reminders-box', vertical: true, x_expand: true, y_expand: true });
        const header = new St.BoxLayout({ style_class: 'macr-widget-reminders-header', x_expand: true });
        const badge = new St.Icon({ icon_name: 'view-list-bullet-symbolic', style_class: 'macr-widget-reminders-badge', y_align: Clutter.ActorAlign.CENTER });
        header.add_child(badge);
        header.add_child(new St.Widget({ x_expand: true }));
        this.count = new St.Label({ style_class: 'macr-widget-reminders-count', y_align: Clutter.ActorAlign.CENTER });
        header.add_child(this.count);
        column.add_child(header);
        column.add_child(new St.Label({ text: _('Reminders'), style_class: 'macr-widget-reminders-title' }));
        this.list = new St.BoxLayout({ style_class: 'macr-widget-reminders-list', vertical: true, x_expand: true, y_expand: true, clip_to_allocation: true });
        column.add_child(this.list);

        const adding = new St.BoxLayout({ style_class: 'macr-widget-reminders-row', x_expand: true });
        adding.add_child(new St.Icon({ icon_name: 'list-add-symbolic', style_class: 'macr-widget-reminders-add', y_align: Clutter.ActorAlign.CENTER }));
        this.entry = new St.Entry({ style_class: 'macr-widget-reminders-entry', hint_text: _('New Reminder'), x_expand: true, can_focus: true });
        const text = this.entry.clutter_text;
        // Clicks reach the widget until typing starts.
        this.entry.reactive = false;
        text.reactive = false;
        text.connect('activate', () => this.addTyped());
        adding.add_child(this.entry);
        column.add_child(adding);
        this.actor.add_child(column);
        this.editing = new Editing(this.actor);

        this.changedId = host.settings.connect(`changed::${KEY}`, () => this.sync());
        this.sync();
    }

    override destroy(): void {
        this.host.settings.disconnect(this.changedId);
        this.editing.stop();
        // Ticked-off reminders go now rather than come back.
        let list = this.reminders();
        for (const [id, timeout] of this.ticked) {
            GLib.source_remove(timeout);
            list = removeReminder(list, id);
        }
        this.ticked.clear();
        this.save(list);
        super.destroy();
    }

    protected override get opensApp(): boolean {
        return false;
    }

    /** A click starts typing a new reminder. */
    protected activate(): void {
        if (this.editing.active) return;
        const text = this.entry.clutter_text;
        this.entry.reactive = true;
        text.reactive = true;
        this.editing.start(text, () => {
            this.addTyped();
            this.entry.reactive = false;
            text.reactive = false;
            this.entry.text = '';
            this.actor.remove_style_class_name('macr-editing');
        });
        this.actor.add_style_class_name('macr-editing');
    }

    private reminders(): Reminder[] {
        return parseReminders(this.host.settings.get_string(KEY));
    }

    private save(list: readonly Reminder[]): void {
        const json = serializeReminders(list);
        if (this.host.settings.get_string(KEY) !== json) this.host.settings.set_string(KEY, json);
    }

    private addTyped(): void {
        const list = this.reminders();
        const added = addReminder(list, newId(Date.now(), list.map((one) => one.id)), this.entry.text);
        if (added === list) return;
        this.entry.text = '';
        this.save(added);
    }

    private tick(reminder: Reminder, row: St.BoxLayout, circle: St.Button): void {
        if (this.ticked.has(reminder.id)) return;
        circle.checked = true;
        row.ease({ opacity: 90, duration: TICK_DELAY, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        this.ticked.set(
            reminder.id,
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_DELAY, () => {
                this.ticked.delete(reminder.id);
                this.save(removeReminder(this.reminders(), reminder.id));
                return GLib.SOURCE_REMOVE;
            }),
        );
    }

    private sync(): void {
        const list = this.reminders();
        this.count.text = String(list.length);
        this.list.destroy_all_children();
        for (const reminder of list.slice(0, remindersShown(this.size))) {
            const row = new St.BoxLayout({ style_class: 'macr-widget-reminders-row', x_expand: true });
            const circle = new St.Button({ style_class: 'macr-widget-reminders-circle', can_focus: false, toggle_mode: false, y_align: Clutter.ActorAlign.CENTER, child: new St.Icon({ icon_name: 'object-select-symbolic' }) });
            circle.connect('clicked', () => this.tick(reminder, row, circle));
            const label = new St.Label({ text: reminder.text, style_class: 'macr-widget-reminders-text', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            row.add_child(circle);
            row.add_child(label);
            if (this.ticked.has(reminder.id)) {
                circle.checked = true;
                row.opacity = 90;
            }
            this.list.add_child(row);
        }
    }
}
