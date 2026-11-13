import type Meta from 'gi://Meta';

import type { Placement, Rect } from './logic/geometry.js';

/** What Macr remembers about a window it placed. */
export interface TileState {
    /** Its frame before it was first tiled: Return to Previous Size and dragging it off go back to it. */
    restore: Rect | null;
    /** The frame Macr gave it. It counts as tiled only while it still has it. */
    tile: Rect | null;
    placement: Placement | null;
}

interface Entry extends TileState {
    window: Meta.Window;
    unmanagedId: number;
}

/**
 * Per-window tiling state, kept by window id outside the tiling module, so
 * locking the screen (which turns the module off and on) does not lose it.
 * `Macr.disable()` clears it.
 */
const entries = new Map<number, Entry>();

export function tileState(window: Meta.Window): TileState | null {
    return entries.get(window.get_id()) ?? null;
}

/** Changes what is remembered about `window`, starting from nothing. */
export function updateTileState(window: Meta.Window, change: Partial<TileState>): void {
    const id = window.get_id();
    let entry = entries.get(id);
    if (!entry) {
        const unmanagedId = window.connect('unmanaged', () => forgetWindow(window));
        entry = { window, unmanagedId, restore: null, tile: null, placement: null };
        entries.set(id, entry);
    }
    Object.assign(entry, change);
    if (!entry.restore && !entry.tile) forgetWindow(window);
}

export function forgetWindow(window: Meta.Window): void {
    const entry = entries.get(window.get_id());
    if (!entry) return;
    entry.window.disconnect(entry.unmanagedId);
    entries.delete(window.get_id());
}

export function clearTilingStore(): void {
    for (const entry of [...entries.values()]) forgetWindow(entry.window);
}
