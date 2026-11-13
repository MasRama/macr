import Gio from 'gi://Gio';
import type Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import type { Module, ModuleContext } from '../../shared/module.js';
import { onStagesChanged, stageManager } from '../../shared/stage-link.js';
import { setAppDesktops, setBounce } from './dash.js';
import { AppDesktops } from './desktops.js';
import { Dock, type DockOptions } from './dock.js';
import { Genie } from './genie.js';
import { LauncherEntries, setLauncherEntries } from './launcher.js';
import { parseEdge } from './logic/edge.js';
import { minimizedByDock } from './logic/minimized.js';
import { MinimizedWindows } from './minimized.js';
import { RecentApps } from './recent.js';

const OPTION_KEYS = ['dock-icon-size', 'dock-autohide', 'dock-magnification'];

type Disconnectable = { disconnect(id: number): void };

/**
 * The macOS dock along the bottom (or down a side) of every monitor (or only the primary one),
 * replacing the overview's dash (and Dash to Dock), plus the genie minimize
 * (instead of Magic Lamp).
 */
export class DockModule implements Module {
    private docks: Dock[] = [];
    private genie: Genie | null = null;
    private recent: RecentApps | null = null;
    private launcher: LauncherEntries | null = null;
    private minimized: MinimizedWindows | null = null;
    private desktops: AppDesktops | null = null;
    private stopStages: (() => void) | null = null;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private ids: [Disconnectable, number][] = [];

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const settings = this.context.settings;
        // The overview keeps its layout but loses its own dash.
        const overviewDash = Main.overview.dash;
        overviewDash.hide();
        overviewDash.set_height(0);
        // Before the docks: their icons follow the badges from the start.
        this.launcher = new LauncherEntries();
        setLauncherEntries(this.launcher);
        this.desktops = new AppDesktops(settings);
        setAppDesktops(this.desktops);
        this.recent = new RecentApps(settings, () => {
            for (const dock of this.docks) dock.refreshApps();
        });

        for (const key of OPTION_KEYS) this.ids.push([settings, settings.connect(`changed::${key}`, () => this.applyOptions())]);
        this.ids.push([settings, settings.connect('changed::dock-all-monitors', () => this.build())]);
        this.ids.push([settings, settings.connect('changed::dock-position', () => this.build())]);
        this.ids.push([settings, settings.connect('changed::dock-genie', () => this.syncGenie())]);
        this.ids.push([settings, settings.connect('changed::dock-minimize-to-app', () => this.syncMinimized())]);
        setBounce(settings.get_boolean('dock-bounce'));
        this.ids.push([settings, settings.connect('changed::dock-bounce', () => setBounce(settings.get_boolean('dock-bounce')))]);
        const display = global.display as unknown as { connect(signal: string, callback: (display: unknown, window: Meta.Window) => void): number } & Disconnectable;
        for (const signal of ['window-demands-attention', 'window-marked-urgent'])
            this.ids.push([display, display.connect(signal, (_display, window) => this.onAttention(window))]);
        this.ids.push([this.interface, this.interface.connect('changed::color-scheme', () => this.syncScheme())]);
        const layout = Main.layoutManager as unknown as { connect(signal: string, callback: () => void): number } & Disconnectable;
        this.ids.push([layout, layout.connect('monitors-changed', () => this.build())]);
        const overview = Main.overview as unknown as { connect(signal: string, callback: () => void): number } & Disconnectable;
        this.ids.push([overview, overview.connect('showing', () => this.syncOverviewSpace())]);
        this.minimized = new MinimizedWindows(() => this.syncMinimized());
        this.stopStages = onStagesChanged(() => this.syncMinimized());
        this.build();
        this.syncGenie();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        this.genie?.destroy();
        this.genie = null;
        setAppDesktops(null);
        this.desktops?.destroy();
        this.desktops = null;
        this.stopStages?.();
        this.stopStages = null;
        this.minimized?.destroy();
        this.minimized = null;
        this.destroyDocks();
        this.recent?.destroy();
        this.recent = null;
        setLauncherEntries(null);
        this.launcher?.destroy();
        this.launcher = null;
        const overviewDash = Main.overview.dash;
        overviewDash.set_height(-1);
        overviewDash.show();
    }

    /** An app asking for attention (a new message, a finished job) bounces its icon, unless it is in front. */
    private onAttention(window: Meta.Window): void {
        if (window.has_focus()) return;
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        if (!app || Shell.WindowTracker.get_default().focus_app === app) return;
        for (const dock of this.docks) dock.bounceApp(app, 'attention');
    }

    /** One dock per monitor, or only on the primary; again when monitors change. */
    private build(): void {
        this.destroyDocks();
        const { monitors, primaryIndex } = Main.layoutManager;
        const everywhere = this.context.settings.get_boolean('dock-all-monitors');
        monitors.forEach((_monitor, index) => {
            if (everywhere || index === primaryIndex) this.docks.push(new Dock(this.options(), index));
        });
        this.syncScheme();
        this.syncMinimized();
    }

    /**
     * The overview keeps the hidden dash's height free at the bottom: the
     * primary dock's, so Mission Control's windows stay above it.
     */
    private syncOverviewSpace(): void {
        const dock = this.docks.find((item) => item.monitorIndex === Main.layoutManager.primaryIndex);
        Main.overview.dash.set_height(dock?.overviewSpace ?? 0);
    }

    /** Each dock's minimized windows, unless they go into their app's icon. */
    private syncMinimized(): void {
        const toApp = this.context.settings.get_boolean('dock-minimize-to-app');
        const windows = toApp ? [] : (this.minimized?.windows() ?? []);
        const byId = new Map(windows.map(({ window }) => [window.get_id(), window]));
        const byDock = minimizedByDock(
            windows.map(({ window, order }) => ({
                id: window.get_id(),
                monitor: window.get_monitor(),
                order,
                staged: stageManager()?.holds(window.get_id()) ?? false,
            })),
            this.docks.map((dock) => dock.monitorIndex),
            Main.layoutManager.primaryIndex,
        );
        for (const dock of this.docks) dock.setMinimized((byDock.get(dock.monitorIndex) ?? []).map((id) => byId.get(id)!));
    }

    private destroyDocks(): void {
        for (const dock of this.docks) dock.destroy();
        this.docks = [];
    }

    private applyOptions(): void {
        const options = this.options();
        for (const dock of this.docks) dock.setOptions(options);
    }

    private options(): DockOptions {
        const settings = this.context.settings;
        return {
            extensionPath: this.context.path,
            settings,
            iconSize: settings.get_int('dock-icon-size'),
            autohide: settings.get_boolean('dock-autohide'),
            magnification: settings.get_boolean('dock-magnification'),
            edge: parseEdge(settings.get_string('dock-position')),
            recentApps: () => this.recent?.apps() ?? [],
            forgetRecent: (id) => this.recent?.forget(id),
        };
    }

    /** Where a window pours into: its thumbnail, else its app's icon in its own monitor's dock, else the primary's. */
    private iconFor(app: Shell.App, window: Meta.Window): Clutter.Actor | null {
        for (const dock of this.docks) {
            const thumbnail = dock.thumbnailOf(window);
            if (thumbnail) return thumbnail;
        }
        const dock =
            this.docks.find((d) => d.monitorIndex === window.get_monitor()) ??
            this.docks.find((d) => d.monitorIndex === Main.layoutManager.primaryIndex) ??
            this.docks[0];
        return dock?.iconOf(app) ?? null;
    }

    private syncGenie(): void {
        const wanted = this.context.settings.get_boolean('dock-genie');
        if (wanted && !this.genie) {
            this.genie = new Genie(
                (app, window) => this.iconFor(app, window),
                () => parseEdge(this.context.settings.get_string('dock-position')),
            );
        } else if (!wanted && this.genie) {
            this.genie.destroy();
            this.genie = null;
        }
    }

    private syncScheme(): void {
        const light = isLight();
        for (const { actor } of this.docks) {
            if (light) actor.add_style_class_name('macr-light');
            else actor.remove_style_class_name('macr-light');
        }
    }
}
