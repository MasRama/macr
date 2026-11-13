import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { setAppearance } from '../../shared/appearance.js';
import type { Module } from '../../shared/module.js';
import { SunWatcher } from '../../shared/sun.js';
import { phaseKey } from './logic/appearance.js';

/** Sunrise and sunset need not be met to the second. */
const TICK_SECONDS = 60;
const PHASE_KEY = 'appearance-auto-phase';

/**
 * macOS's Auto appearance: light by day, dark at night. It switches only as
 * day turns to night and back (the phase it last applied is kept in
 * settings), so a change made by hand holds until the next sunrise or
 * sunset, across a restart too.
 */
export class AutoAppearanceModule implements Module {
    private sun: SunWatcher | null = null;
    private timerId = 0;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.sun = new SunWatcher(() => this.update());
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, TICK_SECONDS, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });
        this.update();
    }

    disable(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        this.sun?.destroy();
        this.sun = null;
    }

    /** Applies the appearance of the day or night it is, once per phase. */
    update(): void {
        if (!this.sun) return;
        const now = GLib.DateTime.new_now_local();
        const day = Math.floor((now.to_unix() + now.get_utc_offset() / 1e6) / 86400);
        const hour = now.get_hour() + now.get_minute() / 60;
        const { sunrise, sunset } = this.sun.times;
        const phase = phaseKey(day, hour, sunrise, sunset);
        if (phase === this.settings.get_string(PHASE_KEY)) return;
        this.settings.set_string(PHASE_KEY, phase);
        setAppearance(phase.endsWith(':dark'));
    }
}
