// Four-finger touchpad gestures, as on macOS: pinch for Launchpad, spread
// for the desktop, swipe down for App Exposé. Three fingers stay GNOME's.

export const FINGERS = 4;

/** How much the pinch scale moves before its direction counts. */
const PINCH_DEAD = 0.04;
/** The scale change that takes a pinch, or a spread, all the way. */
const PINCH_RANGE = 0.45;
const SPREAD_RANGE = 0.8;
/** Touchpad units (unaccelerated px) a swipe moves before its direction counts, and to go all the way. */
const SWIPE_DEAD = 16;
const SWIPE_RANGE = 300;
/** Fingers lifted past this much of the way finish the gesture; short of it, it springs back. */
const COMMIT = 0.25;

export type Pinch = 'in' | 'out';
export type Swipe = 'up' | 'down';
export type Target = 'launchpad' | 'desktop' | 'expose';

/** What shows when the fingers land. */
export interface Shown {
    launchpad: boolean;
    desktop: boolean;
    expose: boolean;
}

/** What a gesture drives, and whether it opens it or closes it. */
export interface Action {
    target: Target;
    opening: boolean;
}

function clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
}

export function pinchDirection(scale: number): Pinch | null {
    if (Math.abs(scale - 1) < PINCH_DEAD) return null;
    return scale < 1 ? 'in' : 'out';
}

/** How far along (0–1) a pinch in `direction` is at `scale`. */
export function pinchProgress(direction: Pinch, scale: number): number {
    return clamp(direction === 'in' ? (1 - scale) / PINCH_RANGE : (scale - 1) / SPREAD_RANGE);
}

/** Up or down once the fingers moved far enough, 'sideways' for a horizontal swipe, else null. */
export function swipeDirection(dx: number, dy: number): Swipe | 'sideways' | null {
    if (Math.hypot(dx, dy) < SWIPE_DEAD) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return 'sideways';
    return dy > 0 ? 'down' : 'up';
}

/** How far along (0–1) a swipe in `direction` is after the fingers moved `dy` in all. */
export function swipeProgress(direction: Swipe, dy: number): number {
    return clamp((direction === 'down' ? dy : -dy) / SWIPE_RANGE);
}

/**
 * Pinching opens Launchpad, or brings the windows back over the desktop;
 * spreading shows the desktop, or closes Launchpad.
 */
export function pinchAction(direction: Pinch, shown: Shown): Action | null {
    if (shown.expose) return null;
    if (direction === 'in') {
        if (shown.desktop) return { target: 'desktop', opening: false };
        return shown.launchpad ? null : { target: 'launchpad', opening: true };
    }
    if (shown.launchpad) return { target: 'launchpad', opening: false };
    return shown.desktop ? null : { target: 'desktop', opening: true };
}

/** Swiping down opens App Exposé; swiping up closes it. */
export function swipeAction(direction: Swipe, shown: Shown): Action | null {
    if (direction === 'up') return shown.expose ? { target: 'expose', opening: false } : null;
    return shown.expose || shown.launchpad ? null : { target: 'expose', opening: true };
}

/** How open the target shows (0 closed, 1 open) while the gesture is `progress` along. */
export function openness(action: Action, progress: number): number {
    return action.opening ? progress : 1 - progress;
}

/** Whether the target ends open once the fingers lift (or the gesture is cancelled). */
export function endsOpen(action: Action, progress: number, cancelled: boolean): boolean {
    const done = !cancelled && progress >= COMMIT;
    return done === action.opening;
}
