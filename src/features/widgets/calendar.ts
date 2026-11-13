import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { monthGrid, type WidgetId } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** Checks for a new day this often (seconds). */
const TICK_SECONDS = 30;

/** The macOS month widget: the month in red, its days, today in a red circle. */
export class CalendarWidget extends DesktopWidget {
    private readonly box: St.BoxLayout;
    private shown = '';
    private timerId = 0;

    constructor(id: WidgetId, size: number, host: WidgetHost) {
        super(id, size, host);
        this.box = new St.BoxLayout({ style_class: 'macr-widget-calendar-box', vertical: true, x_expand: true, y_expand: true });
        this.actor.add_child(this.box);
        this.update();
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, TICK_SECONDS, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    override destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        super.destroy();
    }

    protected activate(): void {
        this.openApp('org.gnome.Calendar.desktop');
    }

    /** Builds the month again when the day has changed. */
    private update(): void {
        const now = GLib.DateTime.new_now_local();
        const today = now.format('%F') ?? '';
        if (today === this.shown) return;
        this.shown = today;
        this.box.destroy_all_children();

        this.box.add_child(new St.Label({ text: (now.format('%B') ?? '').toUpperCase(), style_class: 'macr-widget-month' }));
        const layout = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL });
        const grid = new St.Widget({ layout_manager: layout, style_class: 'macr-widget-month-grid', x_expand: true, y_expand: true });
        // Fixed cells: the grid fills the widget whatever the labels' widths.
        const scale = this.host.scale;
        const cellWidth = Math.floor((this.size - 24 * scale) / 7);
        const cellHeight = Math.floor((this.size - 46 * scale) / 7);
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
        this.box.add_child(grid);
    }
}
