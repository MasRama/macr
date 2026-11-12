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
}

const CORNERS: [CornerName, number, number][] = [
    ['top-left', -1, -1],
    ['top-right', 1, -1],
    ['bottom-left', -1, 1],
    ['bottom-right', 1, 1],
];

/**
 * The monitor corners the pointer can be pushed into: a corner where another
 * monitor continues past either edge is one the pointer just moves through.
 */
export function outerCorners(monitors: Rect[]): Corner[] {
    const inside = (x: number, y: number) =>
        monitors.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);

    const corners: Corner[] = [];
    monitors.forEach((m, monitor) => {
        for (const [corner, dx, dy] of CORNERS) {
            const x = dx < 0 ? m.x : m.x + m.width - 1;
            const y = dy < 0 ? m.y : m.y + m.height - 1;
            if (inside(x + dx, y) || inside(x, y + dy) || inside(x + dx, y + dy)) continue;
            corners.push({ monitor, corner, x, y });
        }
    });
    return corners;
}
