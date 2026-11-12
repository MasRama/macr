import type { Module } from '../../shared/module.js';
import { MissionControl } from './mission-control.js';

/** GNOME's overview as macOS Mission Control. */
export class MissionControlModule implements Module {
    private missionControl: MissionControl | null = null;

    enable(): void {
        this.missionControl = new MissionControl();
    }

    disable(): void {
        this.missionControl?.destroy();
        this.missionControl = null;
    }
}
