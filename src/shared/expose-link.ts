import type Shell from 'gi://Shell';

/**
 * Lets the dock open App Exposé without the two modules knowing each other:
 * the App Exposé module registers itself while it runs.
 */
export interface ExposeLink {
    readonly isOpen: boolean;
    /** Shows all of `app`'s windows on this workspace. */
    show(app: Shell.App): void;
    /** Shows App Exposé `openness` (0 closed, 1 open) of the way, following a gesture; opens for `app` when closed. */
    track(app: Shell.App | null, openness: number): void;
    /** Finishes what track() started: open, or closed. */
    settle(open: boolean): void;
}

let current: ExposeLink | null = null;

export function expose(): ExposeLink | null {
    return current;
}

export function setExpose(link: ExposeLink | null): void {
    current = link;
}
