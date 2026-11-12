import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { clockFormat } from './logic/clock.js';

type MutableMenu = { sourceActor: St.Widget; isOpen: boolean; toggle(): void; connect(name: string, cb: (...a: unknown[]) => void): number; disconnect(id: number): void };

/**
 * The clock at the right end of the bar. Clicking it opens GNOME's calendar
 * and notifications (the hidden dateMenu's own menu), anchored here.
 */
export class Clock {
    readonly button = new PanelMenu.Button(0.5, 'Macr Clock', true);
    private readonly label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, style_class: 'macr-clock' });
    private readonly wallClock = new GnomeDesktop.WallClock();
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [{ disconnect(id: number): void }, number][] = [];
    private readonly menu: MutableMenu;
    private readonly originalSource: St.Widget;

    constructor() {
        this.button.add_child(this.label);
        this.menu = Main.panel.statusArea.dateMenu.menu as unknown as MutableMenu;
        this.originalSource = this.menu.sourceActor;
        this.menu.sourceActor = this.button;

        this.ids.push([this.wallClock, this.wallClock.connect('notify::clock', () => this.update())]);
        this.ids.push([this.interface, this.interface.connect('changed', () => this.update())]);
        this.ids.push([this.menu, this.menu.connect('open-state-changed', (_m, open) => this.syncActive(open as boolean))]);
        this.ids.push([this.button, this.button.connect('button-press-event', () => this.toggle())]);
        this.ids.push([this.button, this.button.connect('touch-event', (_a, event) => {
            if ((event as Clutter.Event).type() === Clutter.EventType.TOUCH_BEGIN) return this.toggle();
            return Clutter.EVENT_PROPAGATE;
        })]);
        this.update();
    }

    destroy(): void {
        if (this.menu.isOpen) this.menu.toggle();
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        this.menu.sourceActor = this.originalSource;
        this.button.destroy();
    }

    private toggle(): boolean {
        this.menu.toggle();
        return Clutter.EVENT_STOP;
    }

    private syncActive(open: boolean): void {
        if (open) this.button.add_style_pseudo_class('active');
        else this.button.remove_style_pseudo_class('active');
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
