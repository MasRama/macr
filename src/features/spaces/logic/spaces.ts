export interface SpaceCandidate {
    /** A NORMAL window, not a dialog or a panel. */
    normal: boolean;
    onAllWorkspaces: boolean;
    /** GNOME's dynamic workspaces are on, or Macr's Mission Control manages fixed Spaces. */
    addsSpaces: boolean;
    /** Other windows of its workspace showing on its own monitor. */
    othersHere: number;
    /**
     * Windows of its workspace showing on other monitors. GNOME switches
     * every monitor to the new Space when workspaces span all monitors, so
     * these would disappear.
     */
    othersElsewhere: number;
}

/**
 * Whether a window that just went full screen gets a Space of its own, as
 * on macOS. Alone on its monitor it already has one; with a fixed number
 * of workspaces the user set, Macr does not add any. Full screen only
 * changes its own monitor: when moving would take another monitor's
 * windows away, it goes full screen where it is.
 */
export function shouldMove(candidate: SpaceCandidate): boolean {
    return candidate.normal && !candidate.onAllWorkspaces && candidate.addsSpaces && candidate.othersHere > 0 && candidate.othersElsewhere === 0;
}

/** The workspace a window goes back to when its own is gone: the one it came from, or the last left. */
export function returnIndex(origin: number, count: number): number {
    return Math.max(0, Math.min(origin, count - 1));
}
