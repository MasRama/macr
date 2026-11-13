import { APPS_PROVIDER } from './results.js';

/**
 * Spotlight's views (macOS Tahoe): everything, or only Apps, Files, Actions
 * or the Clipboard, on Cmd+1 to Cmd+4.
 */
export type SpotlightView = 'all' | 'apps' | 'files' | 'actions' | 'clipboard';

/** The views on the buttons and on Super+1..4, in that order. */
export const VIEWS = ['apps', 'files', 'actions', 'clipboard'] as const;

export const ACTIONS_PROVIDER = 'macr-actions';
export const RECENT_PROVIDER = 'macr-recent';
export const FREQUENT_PROVIDER = 'macr-frequent';
export const ALL_APPS_PROVIDER = 'macr-all-apps';
/** Macr's answers around GNOME's providers (answers.ts). */
const FIRST = ['macr-convert'];
const LAST = ['macr-define', 'macr-web'];

/** The view Super+`digit` goes to from `current`: the same digit again goes back to everything. */
export function viewForKey(digit: number, current: SpotlightView): SpotlightView | null {
    const view = VIEWS[digit - 1];
    if (!view) return null;
    return view === current ? 'all' : view;
}

/** What Esc does: clear the text, leave the view, or close Spotlight. */
export function escapeStep(text: string, view: SpotlightView): 'clear' | 'leave' | 'close' {
    if (text) return 'clear';
    return view === 'all' ? 'close' : 'leave';
}

/** GNOME's search providers that find files: Files (Nautilus) and LocalSearch / Tracker. */
export function isFileProvider(id: string): boolean {
    return /nautilus|localsearch|tracker/i.test(id);
}

/**
 * The providers a view asks, in the order their sections show, from GNOME's
 * own (`gnome`, in the overview's order). An empty field gives nothing in the
 * everything view, and Macr's lists (frequent and all apps, recent files,
 * every action) in the others.
 */
export function viewProviders(view: SpotlightView, empty: boolean, gnome: readonly string[]): string[] {
    switch (view) {
        case 'all': {
            if (empty) return [];
            const apps = gnome.indexOf(APPS_PROVIDER) + 1;
            return [...FIRST, ...gnome.slice(0, apps), ACTIONS_PROVIDER, ...gnome.slice(apps), ...LAST];
        }
        case 'apps':
            if (empty) return [FREQUENT_PROVIDER, ALL_APPS_PROVIDER];
            return gnome.includes(APPS_PROVIDER) ? [APPS_PROVIDER] : [];
        case 'files':
            return empty ? [RECENT_PROVIDER] : [RECENT_PROVIDER, ...gnome.filter(isFileProvider)];
        case 'actions':
            return [ACTIONS_PROVIDER];
        case 'clipboard':
            return [];
    }
}

/** Lower case without accents, so "resu" finds "Résumé". */
function fold(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

/** Whether every term starts a word of `text`, in any case and order. */
export function matchesTerms(text: string, terms: readonly string[]): boolean {
    const words = fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return terms.every((term) => {
        const folded = fold(term);
        return words.some((word) => word.startsWith(folded));
    });
}

export interface Matchable {
    name: string;
    keywords?: readonly string[];
}

/** The items whose name or keywords match every term, in their order, at most `max`. */
export function matchItems<T extends Matchable>(items: readonly T[], terms: readonly string[], max = Infinity): T[] {
    return items.filter((item) => matchesTerms([item.name, ...(item.keywords ?? [])].join(' '), terms)).slice(0, max);
}

/** `items` A to Z by `name`, ignoring case and accents. */
export function alphabetical<T>(items: readonly T[], name: (item: T) => string): T[] {
    return [...items].sort((a, b) => fold(name(a)).localeCompare(fold(name(b))));
}

/**
 * `groups` with an item dropped when an earlier group already lists the
 * same key (a recent file the Files provider finds too); items whose key is
 * null are always kept.
 */
export function dropRepeats<T, G extends { results: T[] }>(groups: readonly G[], key: (item: T) => string | null): G[] {
    const seen = new Set<string>();
    return groups.map((group) => ({
        ...group,
        results: group.results.filter((item) => {
            const at = key(item);
            if (at === null) return true;
            if (seen.has(at)) return false;
            seen.add(at);
            return true;
        }),
    }));
}

/**
 * What makes two results the same for dropRepeats: a file's URI, or a
 * system action's id (GNOME's app provider lists Lock Screen and the like
 * under its apps; Macr's Actions has them as `system:<id>`).
 */
export function repeatKey(providerId: string, id: string): string | null {
    if (id.startsWith('file:///')) return id;
    if (providerId === APPS_PROVIDER && isSystemAction(id)) return `system:${id}`;
    if (providerId === ACTIONS_PROVIDER && id.startsWith('system:')) return id;
    return null;
}

/** Whether an app provider result is one of GNOME's system actions, not an app. */
export function isSystemAction(id: string): boolean {
    return !id.endsWith('.desktop');
}
