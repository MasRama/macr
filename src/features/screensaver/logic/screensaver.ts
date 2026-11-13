/**
 * Seconds of idleness before the screen saver starts. When GNOME blanks the
 * screen (`blankSeconds` > 0) no sooner than that, the saver would never be
 * seen, so it starts a minute before the blank, or halfway to a blank that
 * comes within a minute.
 */
export function saverDelay(minutes: number, blankSeconds: number): number {
    const wanted = minutes * 60;
    if (blankSeconds <= 0 || wanted < blankSeconds) return wanted;
    return blankSeconds > 60 ? blankSeconds - 60 : Math.floor(blankSeconds / 2);
}

/** A point of the wallpaper's slow drift: its scale, and its offset as a fraction of the screen. */
export interface Drift {
    scale: number;
    x: number;
    y: number;
}

/** Where each move heads, as a fraction of the room the zoom leaves on each side. */
const MOVES: readonly [number, number, number][] = [
    [1.1, -0.8, -0.6],
    [1.16, 0.7, 0.4],
    [1.08, 0.2, 0.8],
    [1.14, -0.6, 0.5],
    [1.1, 0.8, -0.7],
    [1.16, -0.2, -0.3],
];

/** Moves before the drift starts over. */
export const DRIFT_STEPS = MOVES.length;

/**
 * The drift's `step`th resting point. The zoom always leaves room around
 * the screen, and the offset stays inside it, so no edge of the wallpaper
 * shows.
 */
export function driftAt(step: number): Drift {
    const [scale, x, y] = MOVES[step % DRIFT_STEPS]!;
    const room = (scale - 1) / 2;
    return { scale, x: x * room, y: y * room };
}
