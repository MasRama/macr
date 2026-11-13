// Click the wallpaper to reveal the desktop, as on macOS Sonoma.

/** Logical px the pointer may move, and ms the button may stay down, for a click. */
const SLOP = 8;
const HOLD_MS = 600;

export interface Press {
    x: number;
    y: number;
    t: number;
}

/** Whether pressing at `press` and letting go at `release` was a click, not a drag or a long press. */
export function isClick(press: Press, release: Press): boolean {
    return Math.hypot(release.x - press.x, release.y - press.y) <= SLOP && release.t - press.t >= 0 && release.t - press.t <= HOLD_MS;
}
