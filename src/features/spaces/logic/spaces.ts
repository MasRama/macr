export interface SpaceCandidate {
    /** A NORMAL window, not a dialog or a panel. */
    normal: boolean;
    onAllWorkspaces: boolean;
    /** GNOME's dynamic workspaces are on, or Macr's Mission Control manages fixed Spaces. */
    addsSpaces: boolean;
    /** Other windows showing on its workspace. */
    othersShowing: number;
}

/**
 * Whether a window that just went full screen gets a Space of its own, as
 * on macOS. Alone on its workspace it already has one; with a fixed number
 * of workspaces the user set, Macr does not add any.
 */
export function shouldMove(candidate: SpaceCandidate): boolean {
    return candidate.normal && !candidate.onAllWorkspaces && candidate.addsSpaces && candidate.othersShowing > 0;
}

/** The workspace a window goes back to when its own is gone: the one it came from, or the last left. */
export function returnIndex(origin: number, count: number): number {
    return Math.max(0, Math.min(origin, count - 1));
}
