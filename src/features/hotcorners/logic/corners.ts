export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type CornerName = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Corner {
    monitor: number;
    corner: CornerName;
    /** The corner's own pixel. */
    x: number;
    y: number;
    /** Another monitor continues past it, so the pointer has to be held there. */
    shared: boolean;
}

/** A pointer barrier: a vertical or horizontal line the pointer crosses one way only. */
export interface Barrier {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /** The direction the pointer may still move through it. */
    allow: 'positive-x' | 'negative-x' | 'positive-y' | 'negative-y';
}

const CORNERS: [CornerName, number, number][] = [
    ['top-left', -1, -1],
    ['top-right', 1, -1],
    ['bottom-left', -1, 1],
    ['bottom-right', 1, 1],
];

/**
 * The monitor corners that act as hot corners. A free corner is one the
 * pointer can be pushed into. Where another monitor continues past an edge
 * the pointer just moves through, so that corner is skipped, except on the
 * primary monitor, which keeps all four as GNOME keeps its own hot corner
 * there: those are marked shared and need a pressure barrier.
 */
export function hotCorners(monitors: Rect[], primary: number): Corner[] {
    const inside = (x: number, y: number) =>
        monitors.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);

    const corners: Corner[] = [];
    monitors.forEach((m, monitor) => {
        for (const [corner, dx, dy] of CORNERS) {
            const x = dx < 0 ? m.x : m.x + m.width - 1;
            const y = dy < 0 ? m.y : m.y + m.height - 1;
            const shared = inside(x + dx, y) || inside(x, y + dy) || inside(x + dx, y + dy);
            if (shared && monitor !== primary) continue;
            corners.push({ monitor, corner, x, y, shared });
        }
    });
    return corners;
}

/**
 * The two barriers, `size` long, along the edges that meet at a shared
 * corner. They stop the pointer leaving through the corner and let it back
 * into the monitor; pushing against them fires the corner.
 */
export function cornerBarriers(corner: CornerName, m: Rect, size: number): Barrier[] {
    const left = corner.endsWith('left');
    const top = corner.startsWith('top');
    const x = left ? m.x : m.x + m.width;
    const y = top ? m.y : m.y + m.height;
    const [x1, x2] = left ? [x, x + size] : [x - size, x];
    const [y1, y2] = top ? [y, y + size] : [y - size, y];
    return [
        { x1: x, y1, x2: x, y2, allow: left ? 'positive-x' : 'negative-x' },
        { x1, y1: y, x2, y2: y, allow: top ? 'positive-y' : 'negative-y' },
    ];
}
