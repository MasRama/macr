import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import type { Module, ModuleContext } from '../../shared/module.js';
import { Dock, type DockOptions } from './dock.js';
import { Genie } from './genie.js';

const OPTION_KEYS = ['dock-icon-size', 'dock-autohide', 'dock-magnification'];

/**
 * The macOS dock at the bottom of the screen, replacing the overview's dash
 * (and Dash to Dock), plus the genie minimize (instead of Magic Lamp).
 */
export class DockModule implements Module {
    private dock: Dock | null = null;
    private genie: Genie | null = null;
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private ids: [{ disconnect(id: number): void }, number][] = [];

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const settings = this.context.settings;
        const dock = new Dock(this.options());
        this.dock = dock;

        // The overview keeps its layout but loses its own dash.
        const overviewDash = Main.overview.dash;
        overviewDash.hide();
        overviewDash.set_height(0);

        for (const key of OPTION_KEYS) this.ids.push([settings, settings.connect(`changed::${key}`, () => dock.setOptions(this.options()))]);
        this.ids.push([settings, settings.connect('changed::dock-genie', () => this.syncGenie())]);
        this.ids.push([this.interface, this.interface.connect('changed::color-scheme', () => this.syncScheme())]);
        this.syncScheme();
        this.syncGenie();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        this.genie?.destroy();
        this.genie = null;
        this.dock?.destroy();
        this.dock = null;
        const overviewDash = Main.overview.dash;
        overviewDash.set_height(-1);
        overviewDash.show();
    }

    private options(): DockOptions {
        const settings = this.context.settings;
        return {
            extensionPath: this.context.path,
            iconSize: settings.get_int('dock-icon-size'),
            autohide: settings.get_boolean('dock-autohide'),
            magnification: settings.get_boolean('dock-magnification'),
        };
    }

    private syncGenie(): void {
        const wanted = this.context.settings.get_boolean('dock-genie');
        if (wanted && !this.genie && this.dock) {
            const dock = this.dock;
            this.genie = new Genie((app) => dock.iconOf(app));
        } else if (!wanted && this.genie) {
            this.genie.destroy();
            this.genie = null;
        }
    }

    private syncScheme(): void {
        const actor = this.dock?.actor;
        if (!actor) return;
        if (isLight()) actor.add_style_class_name('macr-light');
        else actor.remove_style_class_name('macr-light');
    }
}
