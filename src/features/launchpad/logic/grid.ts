export interface GridShape {
    columns: number;
    rows: number;
    perPage: number;
}

/** Logical pixels of one app cell. */
const CELL = { width: 168, height: 150 };
/** Space kept for the search field (top), the page dots (bottom) and the sides. */
const RESERVED = { top: 120, bottom: 110, side: 80 };
const MAX = { columns: 7, rows: 5 };

/** How many app cells fit on one page of a monitor `width` x `height` (logical px). */
export function gridShape(width: number, height: number): GridShape {
    const fit = (space: number, cell: number, max: number) => Math.max(1, Math.min(max, Math.floor(space / cell)));
    const columns = fit(width - 2 * RESERVED.side, CELL.width, MAX.columns);
    const rows = fit(height - RESERVED.top - RESERVED.bottom, CELL.height, MAX.rows);
    return { columns, rows, perPage: columns * rows };
}

/** `items` in pages of `perPage`; always at least one (maybe empty) page. */
export function paginate<T>(items: T[], perPage: number): T[][] {
    const pages: T[][] = [];
    for (let start = 0; start < items.length; start += perPage) pages.push(items.slice(start, start + perPage));
    return pages.length ? pages : [[]];
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * The item an arrow key moves to from `index` (-1: nothing selected yet).
 * Left and right run through the items and cross pages; up and down stay
 * inside the page.
 */
export function moveSelection(index: number, direction: Direction, count: number, shape: GridShape): number {
    if (count === 0) return -1;
    if (index < 0) return 0;
    const onPage = index % shape.perPage;
    switch (direction) {
        case 'left':
            return Math.max(0, index - 1);
        case 'right':
            return Math.min(count - 1, index + 1);
        case 'up':
            return onPage >= shape.columns ? index - shape.columns : index;
        case 'down':
            return onPage + shape.columns < shape.perPage && index + shape.columns < count ? index + shape.columns : index;
    }
}
