import type Gio from 'gi://Gio';

import type { Module } from '../../shared/module.js';
import { WindowCorners } from './window-corners.js';

/** Rounded macOS corners on windows that do not shape their own. */
export class WindowCornersModule implements Module {
    private corners: WindowCorners | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.corners = new WindowCorners(this.settings);
    }

    disable(): void {
        this.corners?.destroy();
        this.corners = null;
    }
}
