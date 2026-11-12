/** The drawn part of an icon image and how much of that box is filled. */
export interface AlphaBox {
    x: number;
    y: number;
    width: number;
    height: number;
    /** 0..1: the share of the box's pixels that are opaque. */
    fill: number;
}

/**
 * Where the original icon goes on the tile, in tile pixels: `fill` icons are
 * already square tiles and get the macOS shape; `framed` ones sit on a light
 * macOS tile, like macOS does for icons that are not tiles.
 */
export interface TileLayout {
    mode: 'fill' | 'framed';
    x: number;
    y: number;
    scale: number;
}

/** macOS app icons leave 1/16 of the canvas around their tile. */
const MARGIN = 1 / 16;
/** A framed icon's longer side, as a share of the canvas. */
const FRAMED = 0.625;
/** A box this full and this square is an icon that is already a tile. */
const TILE_FILL = 0.9;
const TILE_RATIO = 0.92;

/** The current icon theme and the themes it inherits that are variants of it. */
export function themeFamily(theme: string, inherits: string[]): string[] {
    const base = theme.split('-')[0];
    return [theme, ...inherits.filter((name) => name !== theme && name.split('-')[0] === base)];
}

/** Whether an icon file comes from one of the theme family's folders. */
export function isThemed(path: string, family: string[]): boolean {
    return family.some((theme) => path.includes(`/icons/${theme}/`));
}

/** The bounding box of the solid pixels of an RGBA or RGB image (soft shadows left out). */
export function alphaBox(pixels: Uint8Array, width: number, height: number, rowstride: number, channels: number): AlphaBox {
    if (channels < 4) return { x: 0, y: 0, width, height, fill: 1 };
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (pixels[y * rowstride + x * channels + 3] < 128) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return { x: 0, y: 0, width: 0, height: 0, fill: 0 };
    let opaque = 0;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) if (pixels[y * rowstride + x * channels + 3] > 200) opaque++;
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    return { x: x0, y: y0, width: w, height: h, fill: opaque / (w * h) };
}

/** How to place an icon with this drawn box on a `size` px tile. */
export function tileLayout(box: AlphaBox, size: number): TileLayout {
    const longer = Math.max(box.width, box.height, 1);
    const square = Math.min(box.width, box.height) / longer >= TILE_RATIO;
    const mode = square && box.fill >= TILE_FILL ? 'fill' : 'framed';
    const target = mode === 'fill' ? size * (1 - 2 * MARGIN) : size * FRAMED;
    const scale = target / longer;
    return {
        mode,
        scale,
        x: size / 2 - (box.x + box.width / 2) * scale,
        y: size / 2 - (box.y + box.height / 2) * scale,
    };
}

/** A macOS-like squircle (a superellipse) filling the square at x, y. */
export function squirclePath(x: number, y: number, size: number): string {
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    const n = 5;
    const steps = 96;
    const points: string[] = [];
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        const px = cx + r * Math.sign(cos) * Math.abs(cos) ** (2 / n);
        const py = cy + r * Math.sign(sin) * Math.abs(sin) ** (2 / n);
        points.push(`${round(px)} ${round(py)}`);
    }
    return `M${points[0]} L${points.slice(1).join(' L')} Z`;
}

/** The tile as an SVG of `size` px, embedding the original icon as a PNG. */
export function tileSvg(pngBase64: string, layout: Pick<TileLayout, 'mode' | 'x' | 'y' | 'scale'>, imageWidth: number, imageHeight: number, size = 256): string {
    const inset = size * MARGIN;
    const shape = squirclePath(inset, inset, size - 2 * inset);
    const image = `<image width="${imageWidth}" height="${imageHeight}" transform="translate(${round(layout.x)} ${round(layout.y)}) scale(${round(layout.scale, 4)})" href="data:image/png;base64,${pngBase64}"/>`;
    const border = `<path d="${shape}" fill="none" stroke="#000000" stroke-opacity="0.08" stroke-width="2"/>`;
    const body =
        layout.mode === 'fill'
            ? `<clipPath id="s"><path d="${shape}"/></clipPath><g clip-path="url(#s)">${image}</g>${border}`
            : `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e7ec"/></linearGradient>` +
              `<path d="${shape}" fill="url(#t)"/><clipPath id="s"><path d="${shape}"/></clipPath><g clip-path="url(#s)">${image}</g>${border}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

function round(value: number, digits = 2): string {
    return String(Math.round(value * 10 ** digits) / 10 ** digits);
}
