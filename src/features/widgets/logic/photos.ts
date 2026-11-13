/** The Photos widget shows a new picture this often. */
export const PHOTO_HOURS = 3;

/** Formats GNOME's image loader reads everywhere; animated GIFs and SVGs are not photos. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp']);

export function isPhoto(name: string, contentType: string): boolean {
    return !name.startsWith('.') && PHOTO_TYPES.has(contentType);
}

/**
 * The photo shown at `seconds` (Unix time): the same one for PHOTO_HOURS,
 * then another, picked by a hash of the period rather than in order.
 */
export function photoFor(paths: readonly string[], seconds: number): string | null {
    if (paths.length === 0) return null;
    const period = Math.floor(seconds / (PHOTO_HOURS * 3600));
    const hash = Math.imul(period ^ 0x5bd1e995, 2654435761) >>> 0;
    return paths[hash % paths.length];
}

/** The size to load a `width` x `height` photo at so it covers a `size` square. */
export function coverSize(width: number, height: number, size: number): { width: number; height: number } {
    const scale = size / Math.min(width, height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
