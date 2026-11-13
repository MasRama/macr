export interface Hideable {
    minimized: boolean;
    canMinimize: boolean;
}

/** The windows Hide minimizes: those showing that can be minimized. */
export function hideTargets<T extends Hideable>(windows: readonly T[]): T[] {
    return windows.filter((window) => window.canMinimize && !window.minimized);
}

/**
 * The windows to bring back when `app` gets focus again: the ones Hide
 * minimized for that app and that nobody brought back since.
 */
export function unhideTargets<W, A>(hidden: ReadonlyMap<W, A>, app: A | null, isMinimized: (window: W) => boolean): W[] {
    if (app === null) return [];
    return [...hidden].filter(([window, owner]) => owner === app && isMinimized(window)).map(([window]) => window);
}
