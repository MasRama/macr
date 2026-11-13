import type { Placement, Rect } from '../../../shared/logic/geometry.js';

export interface Point {
    x: number;
    y: number;
}

export interface Zone {
    monitor: number;
    placement: Placement;
}

/** How close to a monitor's edge, in pixels, the pointer must be. */
const EDGE = 4;
/** How far along an edge a corner reaches, as a share of the monitor's shorter side. */
const CORNER = 0.1;
const MIN_CORNER = 48;

/**
 * Where a window dragged with the pointer at `pointer` would tile: the left
 * or right edge tiles a half, a corner a quarter and the top edge fills the
 * monitor. An edge where another monitor continues is one the pointer just
 * moves through, so it does not snap.
 */
export function snapZone(pointer: Point, monitors: Rect[]): Zone | null {
    const inside = (x: number, y: number) =>
        monitors.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
    const monitor = monitors.findIndex((m) =>
        pointer.x >= m.x && pointer.x < m.x + m.width && pointer.y >= m.y && pointer.y < m.y + m.height);
    if (monitor < 0) return null;
    const m = monitors[monitor];
    const { x, y } = pointer;

    // A side is closed where no monitor continues past it.
    const leftClosed = !inside(m.x - 1, y);
    const rightClosed = !inside(m.x + m.width, y);
    const topClosed = !inside(x, m.y - 1);
    const bottomClosed = !inside(x, m.y + m.height);

    const atLeft = leftClosed && x < m.x + EDGE;
    const atRight = rightClosed && x >= m.x + m.width - EDGE;
    const atTop = topClosed && y < m.y + EDGE;
    const atBottom = bottomClosed && y >= m.y + m.height - EDGE;

    const corner = Math.max(MIN_CORNER, Math.round(Math.min(m.width, m.height) * CORNER));
    const nearLeft = leftClosed && x < m.x + corner;
    const nearRight = rightClosed && x >= m.x + m.width - corner;
    const nearTop = topClosed && y < m.y + corner;
    const nearBottom = bottomClosed && y >= m.y + m.height - corner;

    const placement = ((): Placement | null => {
        if ((atLeft && nearTop) || (atTop && nearLeft)) return 'top-left';
        if ((atRight && nearTop) || (atTop && nearRight)) return 'top-right';
        if ((atLeft && nearBottom) || (atBottom && nearLeft)) return 'bottom-left';
        if ((atRight && nearBottom) || (atBottom && nearRight)) return 'bottom-right';
        if (atLeft) return 'left';
        if (atRight) return 'right';
        if (atTop) return 'fill';
        return null;
    })();
    return placement ? { monitor, placement } : null;
}
