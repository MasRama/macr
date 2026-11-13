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

/** Whether a file of this name can show in a stack: not hidden, not an unfinished download. */
export function isShownName(name: string): boolean {
    return !name.startsWith('.') && !PARTIAL.some((suffix) => name.toLowerCase().endsWith(suffix));
}

/** The items a stack shows: no hidden files or unfinished downloads, newest first. */
export function visibleEntries<T extends StackEntry>(entries: readonly T[]): T[] {
    const added = (entry: StackEntry) => entry.created ?? entry.modified;
    return entries
        .filter((entry) => !entry.hidden && isShownName(entry.name))
        .sort((a, b) => added(b) - added(a) || a.name.localeCompare(b.name));
}

export function chooseView(count: number, mode: StackMode): StackView {
    if (mode !== 'automatic') return mode;
    return count <= FAN_MAX ? 'fan' : 'grid';
}

/** How a stack shows in the dock: its newest items piled up, or the folder's icon. */
export type StackDisplay = 'stack' | 'folder';

/** The dock icon piles up at most this many items. */
export const PILE_MAX = 3;

/** The items piled on a stack's dock icon, newest first. */
export function pileEntries<T extends StackEntry>(entries: readonly T[]): T[] {
    return visibleEntries(entries).slice(0, PILE_MAX);
}

/**
 * One item of the pile: its centre's offset from the icon's centre and its
 * size, as shares of the icon's size, and its turn in degrees.
 */
export interface PileLayer {
    x: number;
    y: number;
    rotation: number;
    size: number;
}

/** Bottom to top; the top one is the newest item, lying flat. */
const PILE: readonly PileLayer[] = [
    { x: -0.05, y: 0.03, rotation: -12, size: 0.74 },
    { x: 0.05, y: 0.01, rotation: 9, size: 0.74 },
    { x: 0, y: 0, rotation: 0, size: 0.78 },
];

/** The layers of a pile of `count` items, bottom to top. */
export function pileLayers(count: number): PileLayer[] {
    const n = Math.max(0, Math.min(PILE_MAX, Math.floor(count)));
    return n === 0 ? [] : PILE.slice(PILE.length - n).map((layer) => ({ ...layer }));
}

/** A `width` × `height` picture scaled to fit a `box` square, keeping its shape. */
export function fitInside(width: number, height: number, box: number): { width: number; height: number } {
    if (!(width > 0 && height > 0)) return { width: box, height: box };
    const ratio = Math.min(box / width, box / height);
    return { width: width * ratio, height: height * ratio };
}

/**
 * Whether the newest item `after` just arrived, given the newest one before
 * (`null` for an empty folder, `undefined` before the folder was first read).
 */
export function isNewArrival(before: StackEntry | null | undefined, after: StackEntry | null): boolean {
    if (before === undefined || after === null) return false;
    if (before === null) return true;
    const added = (entry: StackEntry) => entry.created ?? entry.modified;
    return added(after) > added(before);
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

/** XDG folders with an icon of their own. */
export type SpecialFolder = 'desktop' | 'documents' | 'music' | 'pictures' | 'videos' | 'templates' | 'public' | 'downloads';

const SPECIAL_ICONS: Record<SpecialFolder, string> = {
    desktop: 'user-desktop',
    documents: 'folder-documents',
    music: 'folder-music',
    pictures: 'folder-pictures',
    videos: 'folder-videos',
    templates: 'folder-templates',
    public: 'folder-publicshare',
    downloads: 'folder-download',
};

/** The icon of a folder stack: its XDG folder's own, home's, or a plain folder. */
export function folderIcon(path: string, special: Partial<Record<SpecialFolder, string>>, home: string): string {
    const clean = (p: string) => p.replace(/\/+$/, '');
    for (const [kind, dir] of Object.entries(special) as [SpecialFolder, string][]) if (dir && clean(dir) === clean(path)) return SPECIAL_ICONS[kind];
    return clean(path) === clean(home) ? 'user-home' : 'folder';
}

/** The stack list with `path` added at the end, once. */
export function withStack(stacks: readonly string[], path: string): string[] {
    const clean = path.replace(/(.)\/+$/, '$1');
    return stacks.includes(clean) ? [...stacks] : [...stacks, clean];
}
