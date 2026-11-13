import type Gio from 'gi://Gio';

import type { Module } from '../../shared/module.js';
import { FixedSpaces } from './fixed-spaces.js';
import { MissionControl } from './mission-control.js';

/**
 * GNOME's overview as macOS Mission Control, with Spaces that stay until
 * closed. It keeps running on the lock screen: stopping there would bring
 * GNOME's dynamic workspaces back and drop the empty Spaces.
 */
export class MissionControlModule implements Module {
    private spaces: FixedSpaces | null = null;
    private missionControl: MissionControl | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.spaces = new FixedSpaces(this.settings);
        this.missionControl = new MissionControl(this.spaces);
    }

    disable(): void {
        this.missionControl?.destroy();
        this.missionControl = null;
        this.spaces?.destroy();
        this.spaces = null;
    }
}
