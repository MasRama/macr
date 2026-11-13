// Reading the arrow from an Xcursor theme file, to draw it big and sharp.

const MAGIC = 0x72756358; // "Xcur", little-endian
const IMAGE = 0xfffd0002;
const IMAGE_HEADER = 36;

export interface CursorImage {
    /** The cursor size this image is drawn for. */
    nominal: number;
    width: number;
    height: number;
    xhot: number;
    yhot: number;
    /** Where its pixels start: width × height little-endian premultiplied ARGB words. */
    offset: number;
}

/** The images in an Xcursor file, or none when it is not one. */
export function cursorImages(data: Uint8Array): CursorImage[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data.byteLength < 16 || view.getUint32(0, true) !== MAGIC) return [];
    const count = view.getUint32(12, true);
    const images: CursorImage[] = [];
    for (let i = 0; i < count; i++) {
        const entry = 16 + i * 12;
        if (entry + 12 > data.byteLength) break;
        if (view.getUint32(entry, true) !== IMAGE) continue;
        const position = view.getUint32(entry + 8, true);
        if (position + IMAGE_HEADER > data.byteLength) continue;
        const width = view.getUint32(position + 16, true);
        const height = view.getUint32(position + 20, true);
        const offset = position + IMAGE_HEADER;
        if (!width || !height || offset + width * height * 4 > data.byteLength) continue;
        images.push({
            nominal: view.getUint32(position + 8, true),
            width,
            height,
            xhot: view.getUint32(position + 24, true),
            yhot: view.getUint32(position + 28, true),
            offset,
        });
    }
    return images;
}

/** The biggest image: it stays sharpest grown. Animated cursors give their first frame. */
export function largestImage(images: readonly CursorImage[]): CursorImage | null {
    let best: CursorImage | null = null;
    for (const image of images) if (!best || image.width > best.width) best = image;
    return best;
}

/** The themes an icon theme's index.theme says it falls back to. */
export function inheritedThemes(index: string): string[] {
    const line = index.split('\n').find((l) => /^\s*Inherits\s*=/.test(l));
    if (!line) return [];
    return line.slice(line.indexOf('=') + 1).split(',').map((name) => name.trim()).filter(Boolean);
}
