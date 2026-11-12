import type { Module } from '../../shared/module.js';
import { Switcher } from './switcher.js';

/** Alt+Tab and GNOME's other switchers styled as the macOS app switcher. */
export class SwitcherModule implements Module {
    private switcher: Switcher | null = null;

    enable(): void {
        this.switcher = new Switcher();
    }

    disable(): void {
        this.switcher?.destroy();
        this.switcher = null;
    }
}
