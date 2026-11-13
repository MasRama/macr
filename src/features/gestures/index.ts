import { releaseDesktopReveal, useDesktopReveal } from '../../shared/desktop-reveal.js';
import type { Module } from '../../shared/module.js';
import { TouchpadGestures } from './touchpad.js';

/** Four-finger touchpad gestures for Launchpad, the desktop and App Exposé. */
export class GesturesModule implements Module {
    private gestures: TouchpadGestures | null = null;

    enable(): void {
        this.gestures = new TouchpadGestures(useDesktopReveal());
    }

    disable(): void {
        this.gestures?.destroy();
        this.gestures = null;
        releaseDesktopReveal();
    }
}
