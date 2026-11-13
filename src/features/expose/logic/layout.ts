import type { Rect } from '../../../shared/logic/geometry.js';

export interface Size {
    width: number;
    height: number;
}

/** Splits `sizes` (kept in order) into `rows` rows of about the same width. */
function splitRows(sizes: readonly Size[], rows: number): Size[][] {
    const total = sizes.reduce((sum, size) => sum + size.width, 0);
    const target = total / rows;
    const result: Size[][] = [[]];
    let width = 0;
    sizes.forEach((size, index) => {
        const row = result[result.length - 1];
        const left = sizes.length - index;
        const rowsLeft = rows - result.length;
        // Start a new row when this one is full, but leave each later row a window.
        if (row.length > 0 && rowsLeft > 0 && (width + size.width / 2 > target || left <= rowsLeft)) {
            result.push([size]);
            width = size.width;
        } else {
            row.push(size);
            width += size.width;
        }
    });
    return result;
}

/** The scale at which `rows` fit in `area` with `gap` between windows and rows, at most 1. */
function fitScale(rows: Size[][], area: Rect, gap: number): number {
    let scale = 1;
    for (const row of rows) {
        const width = row.reduce((sum, size) => sum + size.width, 0);
        scale = Math.min(scale, (area.width - gap * (row.length - 1)) / width);
    }
    const height = rows.reduce((sum, row) => sum + Math.max(...row.map((size) => size.height)), 0);
    return Math.min(scale, (area.height - gap * (rows.length - 1)) / height);
}

/**
 * App Exposé's slots: the windows in rows, in order, all at one scale (never
 * above 1), with the row count that makes them biggest, centred in `area`.
 */
export function layoutWindows(sizes: readonly Size[], area: Rect, gap: number): Rect[] {
    if (sizes.length === 0) return [];
    let best: { rows: Size[][]; scale: number } | null = null;
    for (let count = 1; count <= sizes.length; count++) {
        const rows = splitRows(sizes, count);
        const scale = fitScale(rows, area, gap);
        if (!best || scale > best.scale + 1e-9) best = { rows, scale };
    }
    const { rows, scale } = best!;
    const heights = rows.map((row) => Math.max(...row.map((size) => size.height)) * scale);
    const total = heights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);
    let y = area.y + (area.height - total) / 2;
    const slots: Rect[] = [];
    rows.forEach((row, index) => {
        const width = row.reduce((sum, size) => sum + size.width * scale, 0) + gap * (row.length - 1);
        let x = area.x + (area.width - width) / 2;
        for (const size of row) {
            const height = size.height * scale;
            slots.push({ x, y: y + (heights[index] - height) / 2, width: size.width * scale, height });
            x += size.width * scale + gap;
        }
        y += heights[index] + gap;
    });
    return slots;
}
