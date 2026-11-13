/**
 * Lets other modules pause Stage Manager without the two knowing each other:
 * the Stage Manager module registers itself while it runs. Show Desktop
 * pauses it while the windows are at the edges, so the focus going away is
 * not taken for the user switching apps. The dock asks which minimized
 * windows are Stage Manager's, and hears when that changes.
 */
export interface StageLink {
    /** Ignore minimizes and focus changes until resume(). */
    pause(): void;
    resume(): void;
    /** Whether the window waits in the strip, minimized by Stage Manager. */
    holds(windowId: number): boolean;
}

let current: StageLink | null = null;
const listeners = new Set<() => void>();

/** The running Stage Manager, if any. */
export function stageManager(): StageLink | null {
    return current;
}

export function setStageManager(link: StageLink | null): void {
    current = link;
    stagesChanged();
}

/** Calls `listener` whenever the windows Stage Manager holds may have changed; returns the undo. */
export function onStagesChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Stage Manager calls this after it minimized or brought back windows. */
export function stagesChanged(): void {
    for (const listener of [...listeners]) listener();
}
