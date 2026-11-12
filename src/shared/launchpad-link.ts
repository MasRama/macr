/**
 * Lets the dock's Apps icon open Launchpad without the two modules knowing
 * each other: the Launchpad module registers itself while it runs.
 */
export interface LaunchpadLink {
    readonly isOpen: boolean;
    toggle(): void;
}

let current: LaunchpadLink | null = null;
const listeners = new Set<() => void>();

/** The running Launchpad, if any. */
export function launchpad(): LaunchpadLink | null {
    return current;
}

export function setLaunchpad(link: LaunchpadLink | null): void {
    current = link;
    notifyLaunchpad();
}

/** Tells listeners that Launchpad opened, closed, came or went. */
export function notifyLaunchpad(): void {
    for (const listener of listeners) listener();
}

/** Calls `listener` whenever Launchpad changes; returns the undo. */
export function onLaunchpadChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
