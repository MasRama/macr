import type { Placement } from './geometry.js';

export type Arrangement = 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';

/** Where Window ▸ Move & Resize ▸ Arrange puts the focused window and its partner. */
export function arrangement(kind: Arrangement): [Placement, Placement] {
    const [first, second] = kind.split('-') as [Placement, Placement];
    return [first, second];
}

export interface Candidate {
    id: number;
    monitor: number;
    minimized: boolean;
    /** Can be moved and resized. */
    tileable: boolean;
}

/**
 * The window arranged next to the focused one: the most recently used other
 * window that shows and can be tiled, one on the focused window's monitor
 * first. `windows` is in most recently used order.
 */
export function arrangePartner(windows: Candidate[], focused: number): number | null {
    const self = windows.find((w) => w.id === focused);
    const others = windows.filter((w) => w.id !== focused && !w.minimized && w.tileable);
    const same = others.find((w) => w.monitor === self?.monitor);
    return (same ?? others[0])?.id ?? null;
}
