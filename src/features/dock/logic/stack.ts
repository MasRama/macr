export interface StackEntry {
    name: string;
    hidden: boolean;
    /** When the file was made (added to the folder), in seconds; null when unknown. */
    created: number | null;
    modified: number;
}

export type StackView = 'fan' | 'grid';
export type StackMode = 'automatic' | StackView;

/** The fan holds at most this many items; Automatic shows more as a grid. */
export const FAN_MAX = 10;

/** Browsers' names for downloads still in progress. */
const PARTIAL = ['.part', '.crdownload', '.download', '.tmp', '.partial'];

/** The items a stack shows: no hidden files or unfinished downloads, newest first. */
export function visibleEntries<T extends StackEntry>(entries: readonly T[]): T[] {
    const added = (entry: StackEntry) => entry.created ?? entry.modified;
    return entries
        .filter((entry) => !entry.hidden && !entry.name.startsWith('.') && !PARTIAL.some((suffix) => entry.name.toLowerCase().endsWith(suffix)))
        .sort((a, b) => added(b) - added(a) || a.name.localeCompare(b.name));
}

export function chooseView(count: number, mode: StackMode): StackView {
    if (mode !== 'automatic') return mode;
    return count <= FAN_MAX ? 'fan' : 'grid';
}

/**
 * The `index`th fan item's icon centre relative to the dock icon's top
 * centre, `step` apart: rising and bending to the right along a parabola,
 * each item turned (degrees, clockwise) to follow the curve.
 */
export function fanSlot(index: number, step: number): { x: number; y: number; rotation: number } {
    const rise = (index + 0.5) * step;
    const bend = 0.0002 * (60 / step);
    const x = bend * (rise * rise - (0.5 * step) ** 2);
    const slope = 2 * bend * rise;
    return { x: index === 0 ? 0 : x, y: -rise, rotation: (Math.atan(slope) * 180) / Math.PI };
}

/** Columns and visible rows of the grid for `count` items. */
export function gridShape(count: number): { columns: number; rows: number } {
    const columns = Math.max(1, Math.min(5, count));
    const rows = Math.max(1, Math.min(4, Math.ceil(count / columns)));
    return { columns, rows };
}
