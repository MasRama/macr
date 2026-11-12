import type Gio from 'gi://Gio';

import type { Module } from '../../shared/module.js';
import { HotCorners } from './hot-corners.js';

/** Screen corners that open Mission Control, Launchpad and more. */
export class HotCornersModule implements Module {
    private corners: HotCorners | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.corners = new HotCorners(this.settings);
    }

    disable(): void {
        this.corners?.destroy();
        this.corners = null;
    }
}
