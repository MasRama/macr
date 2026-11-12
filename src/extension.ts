import type Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { DockModule } from './features/dock/index.js';
import { LaunchpadModule } from './features/launchpad/index.js';
import { MenuBar } from './features/menubar/index.js';
import { SpotlightModule } from './features/spotlight/index.js';
import type { Module, ModuleEntry } from './shared/module.js';

const MODULES: ModuleEntry[] = [
    { key: 'menubar-enabled', create: (context) => new MenuBar(context) },
    { key: 'dock-enabled', create: (context) => new DockModule(context) },
    { key: 'launchpad-enabled', create: (context) => new LaunchpadModule(context) },
    { key: 'spotlight-enabled', create: (context) => new SpotlightModule(context) },
];

export default class Macr extends Extension {
    private settings: Gio.Settings | null = null;
    private running = new Map<string, Module>();
    private changedIds: number[] = [];

    override enable(): void {
        const settings = this.getSettings();
        this.settings = settings;
        for (const entry of MODULES) {
            this.changedIds.push(settings.connect(`changed::${entry.key}`, () => this.sync(entry)));
            this.sync(entry);
        }
    }

    override disable(): void {
        for (const id of this.changedIds) this.settings?.disconnect(id);
        this.changedIds = [];
        for (const module of [...this.running.values()].reverse()) module.disable();
        this.running.clear();
        this.settings = null;
    }

    private sync(entry: ModuleEntry): void {
        const settings = this.settings;
        if (!settings) return;
        const wanted = settings.get_boolean(entry.key);
        const module = this.running.get(entry.key);
        if (wanted && !module) {
            const created = entry.create({ settings, path: this.path });
            created.enable();
            this.running.set(entry.key, created);
        } else if (!wanted && module) {
            module.disable();
            this.running.delete(entry.key);
        }
    }
}
