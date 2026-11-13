import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { launchpad } from '../../shared/launchpad-link.js';
import { stageManager } from '../../shared/stage-link.js';
import { type CornerName, outerCorners } from './logic/corners.js';
import { toggleDesktop } from './logic/desktop.js';

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
    private hidden: number[] = [];
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
            this.toggleDesktop();
            break;
        case 'notification-center':
            this.toggleNotificationCenter();
            break;
        case 'lock-screen':
            Main.screenShield?.lock(true);
            break;
        }
    }

    private toggleDesktop(): void {
        if (Main.overview.visible) Main.overview.hide();
        const windows = global.workspace_manager.get_active_workspace().list_windows()
            .filter((w) => w.get_window_type() === Meta.WindowType.NORMAL && !w.skip_taskbar);
        const byId = new Map(windows.map((w) => [w.get_id(), w]));
        const plan = toggleDesktop(windows.map((w) => ({ id: w.get_id(), minimized: w.minimized })), this.hidden);
        // Not the user minimizing the middle app: Stage Manager sets the windows aside as one stage.
        const stage = stageManager();
        stage?.pause();
        for (const id of plan.minimize) byId.get(id)?.minimize();
        for (const id of plan.restore) byId.get(id)?.unminimize();
        stage?.resume();
        this.hidden = plan.hidden;
    }

    /** Opens the clock's calendar and notifications, on Macr's clock if it is there. */
    private toggleNotificationCenter(): void {
        const menu = (Main.panel.statusArea.dateMenu as unknown as DateMenu).menu;
        const clock = (Main.panel.statusArea as Record<string, unknown>)['macr-clock'];
        if (clock) menu.sourceActor = clock;
        menu.toggle();
    }
}
