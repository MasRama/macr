import type { Rect } from '../../../shared/logic/geometry.js';

/** Gap between the screen edge and the thumbnails. */
const EDGE = 18;
/** Room between thumbnails, where the app icon hangs over. */
const GAP = 26;
/** Room above the first and below the last thumbnail. */
const MARGIN = 24;
const MAX_STAGES = 6;

export interface StripLayout {
    /** The strip's width from the work area's left edge. */
    width: number;
    /** How many stages fit. */
    capacity: number;
    /** Where each stage's thumbnail goes, in stage coordinates. */
    slots: Rect[];
}

/** The strip down the left edge of `area` (a work area) with `count` stages. */
export function stripLayout(area: Rect, count: number): StripLayout {
    const width = Math.round(Math.min(Math.max(area.width * 0.09, 100), 168));
    const height = Math.round(width * 0.78);
    const fit = Math.floor((area.height - 2 * MARGIN + GAP) / (height + GAP));
    const capacity = Math.max(1, Math.min(MAX_STAGES, fit));
    const n = Math.max(0, Math.min(count, capacity));
    const total = n * height + Math.max(0, n - 1) * GAP;
    const top = area.y + Math.round((area.height - total) / 2);
    const slots = Array.from({ length: n }, (_, i) => ({ x: area.x + EDGE, y: top + i * (height + GAP), width, height }));
    return { width: width + 2 * EDGE, capacity, slots };
}

/** A preview of `size` scaled into `slot`: aspect kept, left edge on the slot's, centred vertically. */
export function fitPreview(size: { width: number; height: number }, slot: Rect): Rect {
    if (size.width <= 0 || size.height <= 0) return { ...slot };
    const scale = Math.min(slot.width / size.width, slot.height / size.height);
    const width = Math.round(size.width * scale);
    const height = Math.round(size.height * scale);
    return { x: slot.x, y: slot.y + Math.round((slot.height - height) / 2), width, height };
}
