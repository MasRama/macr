export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** True when the two rectangles share some area (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export type Half = 'left' | 'right' | 'top' | 'bottom';
export type Quarter = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Placement = Half | Quarter | 'fill' | 'center';

/** Which part of one side a placement takes. */
type Part = 'all' | 'first' | 'second';

const PARTS: Record<Exclude<Placement, 'center'>, [Part, Part]> = {
    left: ['first', 'all'],
    right: ['second', 'all'],
    top: ['all', 'first'],
    bottom: ['all', 'second'],
    'top-left': ['first', 'first'],
    'top-right': ['second', 'first'],
    'bottom-left': ['first', 'second'],
    'bottom-right': ['second', 'second'],
    fill: ['all', 'all'],
};

/**
 * Where a window goes inside its monitor's work area. `gap` keeps tiles that
 * far from the work area's edges and from each other.
 */
export function placeWindow(placement: Placement, area: Rect, current: Rect, gap = 0): Rect {
    if (placement === 'center') {
        const inner = inset(area, gap);
        const width = Math.min(current.width, inner.width);
        const height = Math.min(current.height, inner.height);
        return {
            x: area.x + Math.floor((area.width - width) / 2),
            y: area.y + Math.floor((area.height - height) / 2),
            width,
            height,
        };
    }
    const [columns, rows] = PARTS[placement];
    const [x, width] = span(area.x, area.width, columns, gap);
    const [y, height] = span(area.y, area.height, rows, gap);
    return { x, y, width, height };
}

/** One side's start and length: all of it, or its first or second half. */
function span(start: number, length: number, part: Part, gap: number): [number, number] {
    if (part === 'all') return [start + gap, length - 2 * gap];
    const half = Math.floor(length / 2);
    // The two halves give up half the gap each, so they end up `gap` apart.
    const before = Math.floor(gap / 2);
    const after = gap - before;
    if (part === 'first') return [start + gap, half - gap - before];
    return [start + half + after, length - half - gap - after];
}

function inset(area: Rect, gap: number): Rect {
    return { x: area.x + gap, y: area.y + gap, width: area.width - 2 * gap, height: area.height - 2 * gap };
}

/**
 * A window that will not shrink to its tile (a minimum size) ends up bigger
 * than it. Keep it against the tile's outer edges and inside the work area,
 * so a right or bottom tile does not spill off the screen.
 */
export function reanchor(placement: Placement, tile: Rect, frame: Rect, area: Rect): Rect {
    const right = placement === 'right' || placement === 'top-right' || placement === 'bottom-right';
    const bottom = placement === 'bottom' || placement === 'bottom-left' || placement === 'bottom-right';
    const x = right ? tile.x + tile.width - frame.width : tile.x;
    const y = bottom ? tile.y + tile.height - frame.height : tile.y;
    return {
        x: Math.max(area.x, Math.min(x, area.x + area.width - frame.width)),
        y: Math.max(area.y, Math.min(y, area.y + area.height - frame.height)),
        width: frame.width,
        height: frame.height,
    };
}

/** The same rect, give or take a pixel on each value (rounding at fractional scales). */
export function sameRect(a: Rect, b: Rect): boolean {
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
        && Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;
}
