import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { BorrowedMenu } from './borrowed-menu.js';
import { clockFormat } from './logic/clock.js';

/**
 * The clock at the right end of a bar. Clicking it opens GNOME's calendar
 * and notifications (the hidden dateMenu's own menu), anchored here.
 */
export class Clock {
    readonly button = new PanelMenu.Button(0.5, 'Macr Clock', true);
    private readonly label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, style_class: 'macr-clock' });
    private readonly wallClock = new GnomeDesktop.WallClock();
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [{ disconnect(id: number): void }, number][] = [];
    private readonly calendar: BorrowedMenu;

    constructor() {
        this.button.add_child(this.label);
        this.calendar = new BorrowedMenu(this.button, Main.panel.statusArea.dateMenu as unknown as PanelMenu.Button);
        this.ids.push([this.wallClock, this.wallClock.connect('notify::clock', () => this.update())]);
        this.ids.push([this.interface, this.interface.connect('changed', () => this.update())]);
        this.update();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        this.calendar.destroy();
        this.button.destroy();
    }

    private update(): void {
        const format = clockFormat({
            use24h: this.interface.get_string('clock-format') === '24h',
            showWeekday: this.interface.get_boolean('clock-show-weekday'),
            showDate: this.interface.get_boolean('clock-show-date'),
            showSeconds: this.interface.get_boolean('clock-show-seconds'),
        });
        this.label.text = GLib.DateTime.new_now_local().format(format) ?? '';
    }
}
