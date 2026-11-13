import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { releaseDesktopReveal, useDesktopReveal } from '../../shared/desktop-reveal.js';
import { launchpad } from '../../shared/launchpad-link.js';
import { type Barrier, type CornerName, type Corner, cornerBarriers, hotCorners } from './logic/corners.js';

/** The setting that holds each corner's action. */
export const CORNER_KEYS: Record<CornerName, string> = {
    'top-left': 'hot-corner-top-left',
    'top-right': 'hot-corner-top-right',
    'bottom-left': 'hot-corner-bottom-left',
    'bottom-right': 'hot-corner-bottom-right',
};

/** A corner fires at most once in this many milliseconds. */
const COOLDOWN = 600;

/** How far, in pixels, the pointer is pushed into a shared corner, as GNOME's own. */
const PRESSURE = 100;
const PRESSURE_TIMEOUT = 1000;

/** GNOME 46's pressure barrier, exported by layout.js but missing from the typings. */
interface PressureBarrier {
    addBarrier(barrier: Meta.Barrier): void;
    destroy(): void;
    connect(signal: 'trigger', callback: () => void): number;
}
type PressureBarrierClass = new (threshold: number, timeout: number, actionMode: Shell.ActionMode) => PressureBarrier;

const DIRECTIONS: Record<Barrier['allow'], Meta.BarrierDirection> = {
    'positive-x': Meta.BarrierDirection.POSITIVE_X,
    'negative-x': Meta.BarrierDirection.NEGATIVE_X,
    'positive-y': Meta.BarrierDirection.POSITIVE_Y,
    'negative-y': Meta.BarrierDirection.NEGATIVE_Y,
};

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
    private barriers: Meta.Barrier[] = [];
    private pressures: PressureBarrier[] = [];
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
        for (const pressure of this.pressures) pressure.destroy();
        this.pressures = [];
        for (const barrier of this.barriers) barrier.destroy();
        this.barriers = [];
    }

    private build(): void {
        this.clear();
        const barriers = (global.backend.capabilities & Meta.BackendCapabilities.BARRIERS) !== 0;
        for (const spot of hotCorners(this.layout.monitors, this.layout.primaryIndex)) {
            const { corner, x, y } = spot;
            if (this.settings.get_string(CORNER_KEYS[corner]) === 'none') continue;
            if (spot.shared) {
                if (barriers) this.holdShared(spot);
                continue;
            }
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

    /**
     * A corner another monitor continues past is held, as GNOME holds its
     * own hot corner on the primary monitor: barriers along both edges stop
     * the pointer there, and pushing on against them fires it.
     */
    private holdShared({ monitor, corner }: Corner): void {
        const actionMode = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;
        const pressure = new (Layout as unknown as { PressureBarrier: PressureBarrierClass }).PressureBarrier(PRESSURE, PRESSURE_TIMEOUT, actionMode);
        pressure.connect('trigger', () => {
            // Left alone over full-screen windows, like GNOME's own corner.
            if (this.layout.monitors[monitor]?.inFullscreen && !Main.overview.visible) return;
            this.fire(corner);
        });
        const size = this.layout.panelBox.height || 32;
        for (const line of cornerBarriers(corner, this.layout.monitors[monitor], size)) {
            const barrier = new Meta.Barrier({
                backend: global.backend,
                x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
                directions: DIRECTIONS[line.allow],
            });
            pressure.addBarrier(barrier);
            this.barriers.push(barrier);
        }
        this.pressures.push(pressure);
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
