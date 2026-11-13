import { clearTilingStore } from './tiling-store.js';
import { Tiler } from './tiler.js';

/**
 * Lets the Window menu place windows the way the tiling module does without
 * the two knowing each other: the module registers its tiler (with margins)
 * while it runs, and the menu falls back to one without margins.
 */
let current: Tiler | null = null;
let plain: Tiler | null = null;

/** The running tiling module's tiler, else a plain one. */
export function tiler(): Tiler {
    return current ?? (plain ??= new Tiler(() => 0));
}

export function setTiler(running: Tiler | null): void {
    current = running;
}

/** Drops the plain tiler and every window's remembered size; for `Macr.disable()`. */
export function resetTiling(): void {
    plain?.destroy();
    plain = null;
    current = null;
    clearTilingStore();
}
