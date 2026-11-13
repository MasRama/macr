import type Shell from 'gi://Shell';

/**
 * Lets the dock open App Exposé without the two modules knowing each other:
 * the App Exposé module registers itself while it runs.
 */
export interface ExposeLink {
    /** Shows all of `app`'s windows on this workspace. */
    show(app: Shell.App): void;
}

let current: ExposeLink | null = null;

export function expose(): ExposeLink | null {
    return current;
}

export function setExpose(link: ExposeLink | null): void {
    current = link;
}
