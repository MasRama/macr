import { type Box, type Point, wrapRows } from './widgets.js';

/**
 * Where widgets go in the Notification Center: rows across a column
 * `width` wide (two small widgets and the gap), in order, each row as tall
 * as its tallest widget. Returns each widget's place and the room they take.
 */
export function stackWidgets(boxes: readonly Box[], gap: number, width: number): { points: Point[]; size: Box } {
    const points: Point[] = [];
    let y = 0;
    for (const row of wrapRows(boxes.map((box) => box.width), gap, width)) {
        let x = 0;
        let height = 0;
        for (const index of row) {
            points[index] = { x, y };
            x += boxes[index].width + gap;
            height = Math.max(height, boxes[index].height);
        }
        y += height + gap;
    }
    return { points, size: boxes.length ? { width, height: y - gap } : { width: 0, height: 0 } };
}
