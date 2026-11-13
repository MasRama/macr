import type { Rect } from '../../../shared/logic/geometry.js';

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Where the genie effect puts a point of a window being minimized.
 *
 * `x`, `y` are in the window's own coordinates (0..width, 0..height) and
 * `icon` is the dock icon in the same coordinates. The rows nearest the
 * icon narrow and slide first, so the window pours into the icon; at
 * `progress` 1 the whole window is the icon's rectangle.
 */
export function genieVertex(x: number, y: number, win: { width: number; height: number }, icon: Rect, progress: number): [number, number] {
    if (progress <= 0) return [x, y];
    const u = x / win.width;
    const v = y / win.height;
    const squeeze = smooth(clamp01(progress * 1.6 - (1 - v) * 0.6));
    const slide = smooth(clamp01(progress * 1.8 - (1 - v) * 0.8));
    return [lerp(x, icon.x + u * icon.width, squeeze), lerp(y, icon.y + v * icon.height, slide)];
}

/**
 * genieVertex for a dock on any edge: a side dock's window pours sideways,
 * the columns nearest the dock first. Worked out as the bottom case on the
 * window turned (and, for the left, mirrored) so the dock is below it.
 */
export function genieVertexToward(edge: 'bottom' | 'left' | 'right', x: number, y: number, win: { width: number; height: number }, icon: Rect, progress: number): [number, number] {
    if (edge === 'bottom') return genieVertex(x, y, win, icon, progress);
    const turned = { width: win.height, height: win.width };
    if (edge === 'right') {
        const [ty, tx] = genieVertex(y, x, turned, { x: icon.y, y: icon.x, width: icon.height, height: icon.width }, progress);
        return [tx, ty];
    }
    const mirrored = { x: icon.y, y: win.width - icon.x - icon.width, width: icon.height, height: icon.width };
    const [ty, tx] = genieVertex(y, win.width - x, turned, mirrored, progress);
    return [win.width - tx, ty];
}
