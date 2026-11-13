/**
 * macOS's Dock Options > Assign To: an app's windows open on every desktop
 * (`'all'`) or on one (its index), or wherever they open (`null`, None).
 * Saved in `dock-app-desktops` as `app-id=all` or `app-id=N`.
 */
export type Assignment = 'all' | number;

function parse(entry: string): [string, Assignment] | null {
    const at = entry.lastIndexOf('=');
    if (at <= 0) return null;
    const value = entry.slice(at + 1);
    if (value === 'all') return [entry.slice(0, at), 'all'];
    if (!/^\d+$/.test(value)) return null;
    return [entry.slice(0, at), Number(value)];
}

/** The app's assignment in the saved list, null when it has none. */
export function assignmentOf(saved: readonly string[], appId: string): Assignment | null {
    for (const entry of saved) {
        const parsed = parse(entry);
        if (parsed && parsed[0] === appId) return parsed[1];
    }
    return null;
}

/** The saved list with the app's entry replaced by `assignment`, or removed for None. */
export function withAssignment(saved: readonly string[], appId: string, assignment: Assignment | null): string[] {
    const others = saved.filter((entry) => parse(entry)?.[0] !== appId);
    return assignment === null ? others : [...others, `${appId}=${assignment}`];
}

export type Placement = { stick: true } | { stick: false; index: number; add: number };

/**
 * Where an assigned app's window goes: onto every desktop, or to desktop
 * `index`, after adding `add` desktops at the end when it is gone.
 */
export function placement(assignment: Assignment | null, desktops: number): Placement | null {
    if (assignment === null) return null;
    if (assignment === 'all') return { stick: true };
    return { stick: false, index: assignment, add: Math.max(0, assignment + 1 - desktops) };
}
