export interface DesktopWindow {
    id: number;
    minimized: boolean;
}

export interface DesktopPlan {
    minimize: number[];
    restore: number[];
    /** The windows Show Desktop has hidden, to bring back next time. */
    hidden: number[];
}

/**
 * Show Desktop as a toggle: hide every window still showing, or, when none
 * is, bring back the ones it hid last time (and not ones minimized by hand).
 */
export function toggleDesktop(windows: DesktopWindow[], hidden: number[]): DesktopPlan {
    const showing = windows.filter((w) => !w.minimized).map((w) => w.id);
    if (showing.length > 0) return { minimize: showing, restore: [], hidden: showing };
    const restore = windows.filter((w) => w.minimized && hidden.includes(w.id)).map((w) => w.id);
    return { minimize: [], restore, hidden: [] };
}
