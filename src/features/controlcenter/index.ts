import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module } from '../../shared/module.js';
import { ControlCenter, type QuickSettingsButton } from './control-center.js';

/** GNOME's quick settings restyled and laid out as the macOS Control Center. */
export class ControlCenterModule implements Module {
    private center: ControlCenter | null = null;
    private waitId = 0;

    enable(): void {
        this.tryStart();
    }

    disable(): void {
        if (this.waitId) GLib.source_remove(this.waitId);
        this.waitId = 0;
        this.center?.destroy();
        this.center = null;
    }

    /** Quick settings fills itself in asynchronously at startup: wait for it. */
    private tryStart(): void {
        const qs = Main.panel.statusArea.quickSettings as unknown as QuickSettingsButton;
        if (qs._backgroundApps) {
            this.center = new ControlCenter(qs);
            return;
        }
        this.waitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this.waitId = 0;
            this.tryStart();
            return GLib.SOURCE_REMOVE;
        });
    }
}
