/**
 * How many fixed Spaces to keep when dynamic workspaces go off: the
 * desktops in use, without the empty one GNOME keeps at the end.
 */
export function keptCount(count: number, lastIsEmpty: boolean): number {
    return lastIsEmpty && count > 1 ? count - 1 : count;
}

/**
 * Where the windows of a closed Space go: the Space on its left, or on its
 * right for the first one. -1 when it is the only Space, which cannot close.
 */
export function closeTarget(index: number, count: number): number {
    if (count <= 1) return -1;
    return index === 0 ? 1 : index - 1;
}

export interface TakeOver {
    /** Remember the user's settings, to put back on disable. */
    save: boolean;
    /** Turn dynamic workspaces off now. */
    switchOff: boolean;
}

/**
 * What to do with GNOME's dynamic workspaces when Mission Control starts.
 * `saved` is whether settings from an earlier run are still stored (a
 * session that ended with Macr on): those are the user's own, so they stay.
 */
export function takeOver(dynamic: boolean, saved: boolean): TakeOver {
    return { save: dynamic && !saved, switchOff: dynamic };
}
