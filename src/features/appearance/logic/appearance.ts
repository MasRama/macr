export type Appearance = 'light' | 'dark';

/** macOS's Auto appearance: light from sunrise to sunset, dark at night. */
export function appearanceAt(hour: number, sunrise: number, sunset: number): Appearance {
    return hour >= sunrise && hour < sunset ? 'light' : 'dark';
}

/**
 * The day or night `hour` of local day `day` falls in. A night runs from
 * sunset to the next sunrise and keeps the day it started on, so the early
 * morning belongs to the evening before.
 */
export function phaseKey(day: number, hour: number, sunrise: number, sunset: number): string {
    const appearance = appearanceAt(hour, sunrise, sunset);
    return `${hour < sunrise ? day - 1 : day}:${appearance}`;
}

/** A light or dark variant word in a theme name: -Dark, _light, ... */
const VARIANT = /([-_])(dark|light)(?=$|[-_])/gi;

function sameCase(word: string, like: string): string {
    if (like === like.toUpperCase()) return word.toUpperCase();
    if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
    return word;
}

/**
 * The names the other variant of a GTK or shell theme may have, best first:
 * MacTahoe-Dark gives MacTahoe-Light or MacTahoe for light, Yaru gives
 * Yaru-Dark or Yaru-dark for dark. None when `name` already is the wanted
 * variant; a name without a variant word counts as light.
 */
export function themeCandidates(name: string, dark: boolean): string[] {
    if (!name) return [];
    const matches = [...name.matchAll(VARIANT)];
    const last = matches[matches.length - 1];
    if (!last) return dark ? [`${name}-Dark`, `${name}-dark`] : [];
    const [whole, separator, word] = last;
    const isDark = word.toLowerCase() === 'dark';
    if (isDark === dark) return [];
    const before = name.slice(0, last.index);
    const after = name.slice(last.index + whole.length);
    const swapped = `${before}${separator}${sameCase(dark ? 'dark' : 'light', word)}${after}`;
    return dark ? [swapped] : [swapped, `${before}${after}`];
}
