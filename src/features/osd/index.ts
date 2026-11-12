import type { Module } from '../../shared/module.js';
import { Osd } from './osd.js';

/** The volume and brightness OSD as a macOS pill at the top right. */
export class OsdModule implements Module {
    private osd: Osd | null = null;

    enable(): void {
        this.osd = new Osd();
    }

    disable(): void {
        this.osd?.destroy();
        this.osd = null;
    }
}
