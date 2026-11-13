/** macOS keeps the last three apps you used that are not in the Dock. */
export const RECENT_MAX = 3;

/**
 * The recent apps after `closed` quit: it goes first, once; apps in the
 * dock (`favorites`) are never recent ones; the list keeps RECENT_MAX.
 */
export function withRecent(recent: readonly string[], closed: string, favorites: readonly string[]): string[] {
    return [closed, ...recent.filter((id) => id !== closed)].filter((id) => !favorites.includes(id)).slice(0, RECENT_MAX);
}

/** The recent apps with `removed` taken out, or none when no app is given (Clear). */
export function withoutRecent(recent: readonly string[], removed?: string): string[] {
    return removed === undefined ? [] : recent.filter((id) => id !== removed);
}

export interface RecentState {
    running: readonly string[];
    favorites: readonly string[];
    /** Whether the app is still installed. */
    installed(id: string): boolean;
}

/**
 * The recent apps the dock shows after the running ones: not running (they
 * show already), not kept in the dock and still installed.
 */
export function recentShown(recent: readonly string[], state: RecentState): string[] {
    return recent.filter((id) => !state.running.includes(id) && !state.favorites.includes(id) && state.installed(id)).slice(0, RECENT_MAX);
}
