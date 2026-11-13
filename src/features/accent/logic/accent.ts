/** The macOS accent colours (dark appearance values) and the hue each one claims. */
export const ACCENTS = {
    blue: { color: '#0a84ff', hue: 211 },
    purple: { color: '#bf5af2', hue: 280 },
    pink: { color: '#ff375f', hue: 348 },
    red: { color: '#ff453a', hue: 3 },
    orange: { color: '#ff9f0a', hue: 36 },
    yellow: { color: '#ffd60a', hue: 50 },
    green: { color: '#30d158', hue: 135 },
    graphite: { color: '#8e8e93', hue: -1 },
} as const;

export type Accent = keyof typeof ACCENTS;

/** The accent a setting names; 'wallpaper' and unknown names give blue until the wallpaper is read. */
export function accentName(value: string): Accent {
    return value in ACCENTS && value !== 'wallpaper' ? (value as Accent) : 'blue';
}

/** One accent rule of stylesheet.css: what to re-colour, and whether text on it turns dark on yellow. */
export interface AccentRule {
    selectors: string[];
    /** The property and its value for a colour; none when the rule only sets text. */
    property?: string;
    value?: (color: string) => string;
    /** Alpha of the colour, 1 when left out. */
    alpha?: number;
    /** Mixed with white by this much (a hover shade). */
    lighten?: number;
    /** Text sits on the colour: dark on yellow. */
    text?: boolean;
    important?: boolean;
}

/** Every place Macr's stylesheet uses the accent; a test keeps this in step with stylesheet.css. */
export const ACCENT_RULES: AccentRule[] = [
    {
        selectors: ['.macr-menu .popup-menu-item:hover', '.macr-menu .popup-menu-item:focus', '.macr-menu .popup-menu-item:active', '.macr-menu .popup-menu-item:checked'],
        property: 'background-color',
        text: true,
    },
    { selectors: ['.macr-menu.macr-light .popup-menu-item:hover', '.macr-menu.macr-light .popup-menu-item:focus', '.macr-menu.macr-light .popup-menu-item:active'], text: true },
    { selectors: ['.macr-dialog .modal-dialog-linked-button:default', '.macr-dialog.macr-light .modal-dialog-linked-button:default'], property: 'background-color', text: true },
    { selectors: ['.macr-dialog .modal-dialog-linked-button:default:hover'], property: 'background-color', lighten: 0.15 },
    { selectors: ['.macr-force-quit-row:checked'], property: 'background-color', text: true },
    { selectors: ['.macr-spotlight-entry'], property: 'selection-background-color', alpha: 0.6 },
    { selectors: ['.macr-spotlight-row:selected'], property: 'background-color', alpha: 0.9, text: true },
    {
        selectors: ['.macr-cc .quick-toggle:checked .quick-toggle-icon', '.macr-cc .quick-toggle-menu .header .icon.active', '.macr-cc.macr-light .quick-toggle:checked .quick-toggle-icon'],
        property: 'background-color',
        text: true,
        important: true,
    },
    {
        selectors: ['.macr-screenshot-choice:focus', '.macr-screenshot-options:focus', '.macr-screenshot-capture:focus'],
        property: 'box-shadow',
        value: (color) => `inset 0 0 0 2px ${color}`,
        alpha: 0.8,
    },
    { selectors: ['.macr-expose-highlight'], property: 'border', value: (color) => `3px solid ${color}`, alpha: 0.85 },
    { selectors: ['.macr-stack-fan-item:hover .macr-stack-name'], property: 'background-color', alpha: 0.92, text: true },
    { selectors: ['.macr-gallery-done'], property: 'background-color', text: true },
    { selectors: ['.macr-gallery-done:hover'], property: 'background-color', lighten: 0.15 },
    { selectors: ['#macrDash .macr-dock-progress-fill'], property: 'background-color' },
];

const DARK_TEXT = '#1d1d1f';

function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function colorOf(rule: AccentRule, accent: Accent): string {
    let channels = rgb(ACCENTS[accent].color);
    if (rule.lighten) channels = channels.map((c) => c + (255 - c) * rule.lighten!) as [number, number, number];
    if (rule.alpha === undefined) return hex(channels);
    return `rgba(${channels.map(Math.round).join(', ')}, ${rule.alpha})`;
}

/**
 * The selector made one class stronger (its first class twice), so it beats
 * Macr's own rule: St lets the stylesheet loaded first win a tie.
 */
function stronger(selector: string): string {
    return selector.replace(/^\.([\w-]+)/, '.$1.$1');
}

/** A stylesheet that re-colours Macr's accent rules over Macr's own. */
export function accentCss(accent: Accent): string {
    const blocks: string[] = [];
    for (const rule of ACCENT_RULES) {
        const lines: string[] = [];
        const important = rule.important ? ' !important' : '';
        if (rule.property) {
            const color = colorOf(rule, accent);
            lines.push(`  ${rule.property}: ${rule.value ? rule.value(color) : color}${important};`);
        }
        if (rule.text && accent === 'yellow') lines.push(`  color: ${DARK_TEXT}${important};`);
        if (lines.length) blocks.push(`${rule.selectors.map(stronger).join(',\n')} {\n${lines.join('\n')}\n}`);
    }
    return `${blocks.join('\n\n')}\n`;
}

/** A picture's pixels as GdkPixbuf hands them over. */
export interface Pixels {
    pixels: Uint8Array;
    width: number;
    height: number;
    rowstride: number;
    channels: number;
}

/** Hue (0–360), saturation and value (0–1) of an RGB colour. */
function hsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta > 0) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
    }
    return [(hue * 60 + 360) % 360, max === 0 ? 0 : delta / max, max / 255];
}

function hueDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

/** Vivid pixels' share of the picture under which it counts as grey. */
const VIVID_SHARE = 0.04;
/** Below this saturation a pixel is grey. */
const MIN_SATURATION = 0.2;

/**
 * The accent a wallpaper suggests: its vivid pixels (weighted by how vivid
 * they are) vote for the macOS accent nearest their hue; a grey or dark
 * picture gives graphite.
 */
export function wallpaperAccent({ pixels, width, height, rowstride, channels }: Pixels): Accent {
    const votes = new Map<Accent, number>();
    const hued = (Object.keys(ACCENTS) as Accent[]).filter((name) => ACCENTS[name].hue >= 0);
    let total = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = y * rowstride + x * channels;
            const [hue, saturation, value] = hsv(pixels[at], pixels[at + 1], pixels[at + 2]);
            if (saturation < MIN_SATURATION || value < 0.2) continue;
            const weight = saturation * value;
            let nearest = hued[0];
            for (const name of hued) if (hueDistance(hue, ACCENTS[name].hue) < hueDistance(hue, ACCENTS[nearest].hue)) nearest = name;
            // Pale, bright reds are blossom pink, not red.
            if ((nearest === 'red' || nearest === 'pink') && saturation < 0.5 && value > 0.7) nearest = 'pink';
            votes.set(nearest, (votes.get(nearest) ?? 0) + weight);
            total += weight;
        }
    }
    const count = width * height;
    if (count === 0 || total / count < VIVID_SHARE) return 'graphite';
    let best: Accent = 'graphite';
    for (const [name, weight] of votes) if (best === 'graphite' || weight > (votes.get(best) ?? 0)) best = name;
    return best;
}
