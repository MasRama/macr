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
