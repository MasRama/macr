export interface MagnifyOptions {
    /** Scale of the icon right under the pointer. */
    maxScale: number;
    /** How far the effect spreads, in icon widths from the pointer. */
    reach: number;
    /** Items that never grow, such as separators; they only move. */
    fixed?: boolean[];
}

export interface Magnified {
    scales: number[];
    /** Horizontal move of each icon's centre, so neighbours make room. */
    shifts: number[];
    /** Total width the row grows by. */
    extra: number;
    /** Part of `extra` that grows to the left of the pointer. */
    extraLeft: number;
}

/**
 * macOS dock magnification. Icons near the pointer grow on a cosine curve;
 * the row widens by their growth and the spot under the pointer stays put,
 * so the icons left of it move left and the ones right of it move right.
 */
export function magnify(centers: number[], width: number, pointer: number | null, opts: MagnifyOptions): Magnified {
    if (pointer === null) {
        const zeros = centers.map(() => 0);
        return { scales: centers.map(() => 1), shifts: zeros, extra: 0, extraLeft: 0 };
    }
    const range = opts.reach * width;
    const scales = centers.map((center, i) => {
        if (opts.fixed?.[i]) return 1;
        const t = Math.abs(center - pointer) / range;
        return t >= 1 ? 1 : 1 + ((opts.maxScale - 1) * (Math.cos(Math.PI * t) + 1)) / 2;
    });
    const growth = scales.map((scale) => (scale - 1) * width);
    const extra = growth.reduce((sum, g) => sum + g, 0);
    // Each icon grows across its own width: the share left of the pointer
    // pushes the row's left side out.
    const extraLeft = growth.reduce((sum, g, i) => {
        const left = centers[i] - width / 2;
        return sum + g * Math.min(Math.max((pointer - left) / width, 0), 1);
    }, 0);
    let before = 0;
    const shifts = growth.map((g) => {
        const shift = before + g / 2 - extraLeft;
        before += g;
        return shift;
    });
    return { scales, shifts, extra, extraLeft };
}
