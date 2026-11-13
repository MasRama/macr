import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { releaseDesktopReveal, useDesktopReveal } from '../../shared/desktop-reveal.js';
import { launchpad } from '../../shared/launchpad-link.js';
import { type CornerName, outerCorners } from './logic/corners.js';

/** The setting that holds each corner's action. */
export const CORNER_KEYS: Record<CornerName, string> = {
    'top-left': 'hot-corner-top-left',
    'top-right': 'hot-corner-top-right',
    'bottom-left': 'hot-corner-bottom-left',
    'bottom-right': 'hot-corner-bottom-right',
};

/** A corner fires at most once in this many milliseconds. */
const COOLDOWN = 600;

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
/** GNOME 46's layout manager, which owns GNOME's own (top-left) hot corner. */
type LayoutManager = typeof Main.layoutManager & { _updateHotCorners(): void; _destroyHotCorners(): void };
type DateMenu = { menu: { sourceActor: unknown; toggle(): void } };

/**
 * macOS hot corners: pushing the pointer into a screen corner opens Mission
 * Control, Launchpad, the desktop, the Notification Center or locks the
 * screen, as set per corner. GNOME's own hot corner is put aside while this
 * runs, so the two never fire together, and comes back on destroy.
 */
export class HotCorners {
    private readonly layout = Main.layoutManager as LayoutManager;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [Signals, number][] = [];
    private corners: St.Widget[] = [];
    private readonly reveal = useDesktopReveal();
    private lastFired = 0;

    constructor(private readonly settings: Gio.Settings) {
        const update = this.layout._updateHotCorners;
        this.layout._updateHotCorners = () => {
            update.call(this.layout);
            this.layout._destroyHotCorners();
        };
        this.layout._destroyHotCorners();
        // GNOME rebuilds its corner from a handler bound before Macr ran.
        this.connect(this.interface, 'changed::enable-hot-corners', () => this.layout._destroyHotCorners());

        this.connect(this.layout, 'monitors-changed', () => this.build());
        for (const key of Object.values(CORNER_KEYS)) this.connect(this.settings, `changed::${key}`, () => this.build());
        this.build();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        this.clear();
        releaseDesktopReveal();
        delete (this.layout as Partial<LayoutManager>)._updateHotCorners;
        this.layout._updateHotCorners();
    }

    private connect(object: object, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }

    private clear(): void {
        for (const corner of this.corners) corner.destroy();
        this.corners = [];
    }

    private build(): void {
        this.clear();
        for (const { corner, x, y } of outerCorners(this.layout.monitors)) {
            if (this.settings.get_string(CORNER_KEYS[corner]) === 'none') continue;
            const actor = new St.Widget({ name: 'macr-hot-corner', reactive: true, x, y, width: 1, height: 1 });
            actor.connect('enter-event', () => {
                this.fire(corner);
                return false;
            });
            // Hidden over full-screen windows, like GNOME's own corner.
            this.layout.addChrome(actor, { affectsInputRegion: true, trackFullscreen: true });
            this.corners.push(actor);
        }
    }

    private fire(corner: CornerName): void {
        const now = GLib.get_monotonic_time() / 1000;
        if (now - this.lastFired < COOLDOWN) return;
        this.lastFired = now;

        switch (this.settings.get_string(CORNER_KEYS[corner])) {
        case 'mission-control':
            Main.overview.toggle();
            break;
        case 'launchpad': {
            const link = launchpad();
            if (link) link.toggle();
            else Main.overview.showApps();
            break;
        }
        case 'desktop':
            if (Main.overview.visible) Main.overview.hide();
            this.reveal.toggle();
            break;
        case 'notification-center':
            this.toggleNotificationCenter();
            break;
        case 'lock-screen':
            Main.screenShield?.lock(true);
            break;
        }
    }

    /** Opens the clock's calendar and notifications, on Macr's clock if it is there. */
    private toggleNotificationCenter(): void {
        const menu = (Main.panel.statusArea.dateMenu as unknown as DateMenu).menu;
        const clock = (Main.panel.statusArea as Record<string, unknown>)['macr-clock'];
        if (clock) menu.sourceActor = clock;
        menu.toggle();
    }
}
