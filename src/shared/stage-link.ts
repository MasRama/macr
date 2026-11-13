/**
 * Lets other modules pause Stage Manager without the two knowing each other:
 * the Stage Manager module registers itself while it runs. Show Desktop
 * pauses it while the windows are at the edges, so the focus going away is
 * not taken for the user switching apps.
 */
export interface StageLink {
    /** Ignore minimizes and focus changes until resume(). */
    pause(): void;
    resume(): void;
}

let current: StageLink | null = null;

/** The running Stage Manager, if any. */
export function stageManager(): StageLink | null {
    return current;
}

export function setStageManager(link: StageLink | null): void {
    current = link;
}
