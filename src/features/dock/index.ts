import Gio from 'gi://Gio';
import type Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import type Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import type { Module, ModuleContext } from '../../shared/module.js';
import { Dock, type DockOptions } from './dock.js';
import { Genie } from './genie.js';
import { RecentApps } from './recent.js';

const OPTION_KEYS = ['dock-icon-size', 'dock-autohide', 'dock-magnification'];

type Disconnectable = { disconnect(id: number): void };

/**
 * The macOS dock at the bottom of every monitor (or only the primary one),
 * replacing the overview's dash (and Dash to Dock), plus the genie minimize
 * (instead of Magic Lamp).
 */
export class DockModule implements Module {
    private docks: Dock[] = [];
    private genie: Genie | null = null;
    private recent: RecentApps | null = null;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private ids: [Disconnectable, number][] = [];

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const settings = this.context.settings;
        // The overview keeps its layout but loses its own dash.
        const overviewDash = Main.overview.dash;
        overviewDash.hide();
        overviewDash.set_height(0);
        this.recent = new RecentApps(settings, () => {
            for (const dock of this.docks) dock.refreshApps();
        });

        for (const key of OPTION_KEYS) this.ids.push([settings, settings.connect(`changed::${key}`, () => this.applyOptions())]);
        this.ids.push([settings, settings.connect('changed::dock-all-monitors', () => this.build())]);
        this.ids.push([settings, settings.connect('changed::dock-genie', () => this.syncGenie())]);
        this.ids.push([this.interface, this.interface.connect('changed::color-scheme', () => this.syncScheme())]);
        const layout = Main.layoutManager as unknown as { connect(signal: string, callback: () => void): number } & Disconnectable;
        this.ids.push([layout, layout.connect('monitors-changed', () => this.build())]);
        this.build();
        this.syncGenie();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        this.genie?.destroy();
        this.genie = null;
        this.destroyDocks();
        this.recent?.destroy();
        this.recent = null;
        const overviewDash = Main.overview.dash;
        overviewDash.set_height(-1);
        overviewDash.show();
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
            recentApps: () => this.recent?.apps() ?? [],
        };
    }

    /** The icon a window pours into: its own monitor's dock, else the primary's. */
    private iconFor(app: Shell.App, window: Meta.Window): Clutter.Actor | null {
        const dock =
            this.docks.find((d) => d.monitorIndex === window.get_monitor()) ??
            this.docks.find((d) => d.monitorIndex === Main.layoutManager.primaryIndex) ??
            this.docks[0];
        return dock?.iconOf(app) ?? null;
    }

    private syncGenie(): void {
        const wanted = this.context.settings.get_boolean('dock-genie');
        if (wanted && !this.genie) {
            this.genie = new Genie((app, window) => this.iconFor(app, window));
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
