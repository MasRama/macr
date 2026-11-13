import type Meta from 'gi://Meta';

/**
 * Lets Full-screen Spaces add and close Spaces while Mission Control keeps
 * them fixed, without the two modules knowing each other: Mission Control
 * registers itself while it runs.
 */
export interface FixedSpacesLink {
    /** Adds a Space at the end, without switching to it. */
    add(time: number): Meta.Workspace;
    /** Closes a Space: its windows go to the nearest one first. */
    close(workspace: Meta.Workspace, time: number): void;
}

let current: FixedSpacesLink | null = null;

export function fixedSpaces(): FixedSpacesLink | null {
    return current;
}

export function setFixedSpaces(link: FixedSpacesLink | null): void {
    current = link;
}

/** No windows of its own; windows on every workspace do not count, as for GNOME. */
export function isEmpty(workspace: Meta.Workspace): boolean {
    return !workspace.list_windows().some((window) => !window.is_on_all_workspaces());
}
