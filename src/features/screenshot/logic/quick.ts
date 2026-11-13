/** A point on the stage, in pixels. */
export type Point = { x: number; y: number };

/** What the Super+Shift+4 capture is picking. */
export type QuickMode = 'selection' | 'window';

/**
 * Whether a press at `start` and a release at `end` drew a selection worth
 * capturing: at least `min` pixels wide and high. A plain click (GNOME then
 * makes up a box around it) or a sliver captures nothing.
 */
export function isSelection(start: Point, end: Point, min: number): boolean {
    return Math.abs(end.x - start.x) >= min && Math.abs(end.y - start.y) >= min;
}

/** Space swaps the crosshair for the window picker and back, if there are windows. */
export function spaceSwitchesTo(current: QuickMode, windowsToPick: boolean): QuickMode {
    return current === 'selection' && windowsToPick ? 'window' : 'selection';
}
