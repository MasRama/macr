import type { Rect } from '../../../shared/logic/geometry.js';
import type { Point } from './zones.js';

/** How far, in pixels, the pointer moves a tiled window before it lets go of its tile. */
const PULL = 8;

/** Whether a drag that started at `start` has pulled a tiled window off its tile. */
export function pulledOff(start: Point, pointer: Point): boolean {
    const dx = pointer.x - start.x;
    const dy = pointer.y - start.y;
    return dx * dx + dy * dy >= PULL * PULL;
}

/**
 * The frame a tiled window gets back when it is dragged off its tile: its
 * size from before it was tiled, placed so the point the pointer grabbed
 * keeps its share of the window's width and height, as Mutter keeps it for
 * the rest of the drag. `grab` is where the drag began, `pointer` where it is.
 */
export function dragOffRect(grab: Point, pointer: Point, tile: Rect, size: { width: number; height: number }): Rect {
    const across = (grab.x - tile.x) / tile.width;
    const down = (grab.y - tile.y) / tile.height;
    return {
        x: pointer.x - Math.round(across * size.width),
        y: pointer.y - Math.round(down * size.height),
        width: size.width,
        height: size.height,
    };
}
