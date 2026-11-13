import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { type Box, monthGrid, upcomingEvents, type WidgetId, type WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** Checks for a new day, and asks for events again, this often (seconds). */
const TICK_SECONDS = 30;
/** The medium and large widgets list the events of this many days, at most this many. */
const EVENT_DAYS = 7;
const EVENT_ROWS: Record<WidgetSize, number> = { small: 0, medium: 3, large: 5 };

/** The parts of GNOME's calendar event source (ui/calendar.js) the widget uses. */
interface CalendarEvent {
    summary: string;
    date: Date;
    end: Date;
}
interface EventSource {
    readonly isLoading: boolean;
    requestRange(begin: Date, end: Date): void;
    getEvents(begin: Date, end: Date): CalendarEvent[];
    connect(signal: 'changed', callback: () => void): number;
    disconnect(id: number): void;
}

/**
 * The shell's own event source, from the date menu: Evolution Data Server's
 * calendars through gnome-shell-calendar-server. Shared rather than made
 * anew, as that server keeps one time range for all its clients.
 */
function shellEvents(): EventSource | null {
    const dateMenu = Main.panel.statusArea.dateMenu as unknown as { _eventSource?: EventSource } | undefined;
    return dateMenu?._eventSource ?? null;
}

/**
 * The macOS calendar widget: the month in red, its days, today in a red
 * circle; the medium one lists the next events beside it, the large one
 * shows today's date beside the month and more events under them.
 */
export class CalendarWidget extends DesktopWidget {
    private readonly row: St.BoxLayout;
    private readonly month: St.BoxLayout;
    private readonly events: St.BoxLayout | null = null;
    private readonly weekday: St.Label | null = null;
    private readonly day: St.Label | null = null;
    private source: EventSource | null = null;
    private sourceId = 0;
    private shown = '';
    private timerId = 0;
    private readonly clockSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        this.row = new St.BoxLayout({ x_expand: true, y_expand: true, vertical: size === 'large' });
        this.month = new St.BoxLayout({ style_class: 'macr-widget-calendar-box', vertical: true, width: this.unit, height: this.unit });
        if (size === 'large') {
            const top = new St.BoxLayout({ x_expand: true });
            top.add_child(this.month);
            const today = new St.BoxLayout({ style_class: 'macr-widget-today', vertical: true, x_expand: true });
            this.weekday = new St.Label({ style_class: 'macr-widget-today-weekday' });
            this.day = new St.Label({ style_class: 'macr-widget-today-day' });
            today.add_child(this.weekday);
            today.add_child(this.day);
            top.add_child(today);
            this.row.add_child(top);
        } else {
            this.row.add_child(this.month);
        }
        if (size !== 'small') {
            this.events = new St.BoxLayout({ style_class: `macr-widget-events macr-widget-events-${size}`, vertical: true, x_expand: true, y_expand: true });
            this.row.add_child(this.events);
        }
        this.actor.add_child(this.row);
        this.update();
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, TICK_SECONDS, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    override destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        this.unwatch();
        super.destroy();
    }

    protected activate(): void {
        this.openApp('org.gnome.Calendar.desktop');
    }

    private update(): void {
        const now = GLib.DateTime.new_now_local();
        const today = now.format('%F') ?? '';
        if (today !== this.shown) {
            this.shown = today;
            this.buildMonth(now);
        }
        if (this.events) this.requestEvents();
    }

    /** Builds the month again when the day has changed. */
    private buildMonth(now: GLib.DateTime): void {
        if (this.weekday) this.weekday.text = (now.format('%A') ?? '').toUpperCase();
        if (this.day) this.day.text = String(now.get_day_of_month());
        this.month.destroy_all_children();
        this.month.add_child(new St.Label({ text: (now.format('%B') ?? '').toUpperCase(), style_class: 'macr-widget-month' }));
        const layout = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL });
        const grid = new St.Widget({ layout_manager: layout, style_class: 'macr-widget-month-grid', x_expand: true, y_expand: true });
        // Fixed cells: the grid fills the square whatever the labels' widths.
        const scale = this.host.scale;
        const unit = this.unit;
        const cellWidth = Math.floor((unit - 24 * scale) / 7);
        const cellHeight = Math.floor((unit - 46 * scale) / 7);
        const firstWeekday = Shell.util_get_week_start();
        // 1 November 2026 is a Sunday: its week gives the weekdays' initials.
        const sunday = GLib.DateTime.new_local(2026, 11, 1, 12, 0, 0);
        for (let column = 0; column < 7; column++) {
            const name = sunday.add_days((firstWeekday + column) % 7)?.format('%a') ?? '';
            const label = new St.Label({ text: name.slice(0, 1).toUpperCase(), style_class: 'macr-widget-weekday', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
            layout.attach(new St.Bin({ child: label, width: cellWidth, height: cellHeight }), column, 0, 1, 1);
        }
        monthGrid(now.get_year(), now.get_month(), firstWeekday).forEach((week, row) => {
            week.forEach((day, column) => {
                if (day === null) return;
                const label = new St.Label({ text: String(day), style_class: 'macr-widget-day', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
                if (day === now.get_day_of_month()) label.add_style_class_name('today');
                const cell = new St.Bin({ child: label, width: cellWidth, height: cellHeight });
                layout.attach(cell, column, row + 1, 1, 1);
            });
        });
        this.month.add_child(grid);
    }

    /** The next days' events, asked of the server only when its range does not hold them. */
    private requestEvents(): void {
        const source = shellEvents();
        if (source !== this.source) {
            this.unwatch();
            this.source = source;
            this.sourceId = source?.connect('changed', () => this.buildEvents()) ?? 0;
        }
        if (source) {
            const [begin, end] = this.range();
            const asked = source as unknown as { _lastRequestBegin?: Date | null; _lastRequestEnd?: Date | null };
            const covered = asked._lastRequestBegin && asked._lastRequestEnd && asked._lastRequestBegin <= begin && asked._lastRequestEnd >= end;
            if (!covered) source.requestRange(begin, end);
        }
        this.buildEvents();
    }

    private unwatch(): void {
        if (this.source && this.sourceId) this.source.disconnect(this.sourceId);
        this.source = null;
        this.sourceId = 0;
    }

    private range(): [Date, Date] {
        const begin = new Date();
        begin.setHours(0, 0, 0, 0);
        const end = new Date(begin);
        end.setDate(end.getDate() + EVENT_DAYS);
        return [begin, end];
    }

    private buildEvents(): void {
        const box = this.events;
        if (!box) return;
        box.destroy_all_children();
        const [begin, end] = this.range();
        const all = (this.source?.getEvents(begin, end) ?? []).map((event) => ({ summary: event.summary, start: event.date.getTime(), end: event.end.getTime() }));
        const shown = upcomingEvents(all, Date.now(), EVENT_ROWS[this.size]);
        if (shown.length === 0) {
            box.add_child(new St.Label({ text: _('No Events'), style_class: 'macr-widget-events-none', x_expand: true, y_expand: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER }));
            return;
        }
        for (const event of shown) {
            const row = new St.BoxLayout({ style_class: 'macr-widget-event' });
            row.add_child(new St.Widget({ style_class: 'macr-widget-event-bar' }));
            const text = new St.BoxLayout({ vertical: true, x_expand: true });
            const title = new St.Label({ text: event.summary || _('Untitled Event'), style_class: 'macr-widget-event-title' });
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(title);
            text.add_child(new St.Label({ text: this.when(event.start, event.allDay), style_class: 'macr-widget-event-time' }));
            row.add_child(text);
            box.add_child(row);
        }
    }

    /** "All Day" or the time, with the day when it is not today. */
    private when(start: number, allDay: boolean): string {
        const time = GLib.DateTime.new_from_unix_local(Math.floor(start / 1000));
        const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
        const clock = allDay ? _('All Day') : (time.format(this.clockSettings.get_string('clock-format') === '12h' ? '%l:%M %p' : '%R') ?? '').trim();
        if (days <= 0) return clock;
        const day = days === 1 ? _('Tomorrow') : (time.format('%A') ?? '');
        return `${day}, ${clock}`;
    }
}
