/**
 * Lets other modules pause Stage Manager without the two knowing each other:
 * the Stage Manager module registers itself while it runs. Show Desktop
 * pauses it around its own minimize-all, so that is not taken for the user
 * minimizing the middle app.
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
