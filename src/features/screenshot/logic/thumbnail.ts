export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
/** How far a press moved by its release, and how long it took. */
export type Move = { dx: number; dy: number; ms: number };

/** Pixels a press may wander and still be a click. */
const CLICK_SLOP = 6;
/** A swipe this far right dismisses, as a share of the thumbnail's width. */
const DISMISS_SHARE = 1 / 3;
/** A flick: at least this far, at least this fast (pixels per millisecond). */
const FLICK_DISTANCE = 24;
const FLICK_SPEED = 0.5;

/** The picture scaled down to fit `max`, keeping its shape; small ones stay as they are. */
export function fitSize(image: Size, max: Size): Size {
    const scale = Math.min(max.width / image.width, max.height / image.height, 1);
    return {
        width: Math.max(1, Math.round(image.width * scale)),
        height: Math.max(1, Math.round(image.height * scale)),
    };
}

/** The bottom right corner of the work area (so above a dock that reserves space), `margin` in. */
export function thumbnailPosition(workArea: Rect, size: Size, margin: number): { x: number; y: number } {
    return {
        x: workArea.x + workArea.width - size.width - margin,
        y: workArea.y + workArea.height - size.height - margin,
    };
}

/** The thumbnail follows a drag to the right only, towards the edge it leaves by. */
export function swipeOffset(dx: number): number {
    return Math.max(0, dx);
}

/** What a release does: open the picture, send the thumbnail away, or put it back. */
export function releaseAction(move: Move, width: number): 'click' | 'dismiss' | 'return' {
    const { dx, dy, ms } = move;
    if (Math.abs(dx) < CLICK_SLOP && Math.abs(dy) < CLICK_SLOP) return 'click';
    if (dx <= Math.abs(dy)) return 'return';
    if (dx >= width * DISMISS_SHARE) return 'dismiss';
    if (dx >= FLICK_DISTANCE && dx / Math.max(ms, 1) >= FLICK_SPEED) return 'dismiss';
    return 'return';
}
