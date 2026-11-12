import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { setLaunchpad } from '../../shared/launchpad-link.js';
import type { Module, ModuleContext } from '../../shared/module.js';
import { Launchpad } from './launchpad.js';
import { SuperKey } from './super-key.js';

type Disconnectable = { disconnect(id: number): void };
type Connectable = Disconnectable & { connect(signal: string, callback: () => void): number };

/** Launchpad, opened from the dock's Apps icon and (optionally) the Super key. */
export class LaunchpadModule implements Module {
    private launchpad: Launchpad | null = null;
    private superKey: SuperKey | null = null;
    private ids: [Disconnectable, number][] = [];

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const launchpad = new Launchpad();
        this.launchpad = launchpad;
        setLaunchpad(launchpad);
        const settings = this.context.settings;
        this.ids.push([settings, settings.connect('changed::launchpad-super-key', () => this.syncSuperKey())]);
        const overview = Main.overview as unknown as Connectable;
        this.ids.push([overview, overview.connect('showing', () => launchpad.close())]);
        this.syncSuperKey();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        this.superKey?.destroy();
        this.superKey = null;
        setLaunchpad(null);
        this.launchpad?.destroy();
        this.launchpad = null;
    }

    private syncSuperKey(): void {
        const wanted = this.context.settings.get_boolean('launchpad-super-key');
        if (wanted && !this.superKey) this.superKey = new SuperKey(() => this.launchpad?.toggle());
        else if (!wanted && this.superKey) {
            this.superKey.destroy();
            this.superKey = null;
        }
    }
}
