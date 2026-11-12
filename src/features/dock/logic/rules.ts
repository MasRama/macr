export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** True when the two rectangles share some area (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The window after `current` in `windows`, wrapping around; the first one when `current` is not there. */
export function nextWindow<T>(windows: T[], current: T | null): T | null {
    if (windows.length === 0) return null;
    const index = current === null ? -1 : windows.indexOf(current);
    return windows[(index + 1) % windows.length];
}

export interface ClickState {
    running: boolean;
    /** The app owns the focused window. */
    focused: boolean;
    /** The app's windows on the active workspace. */
    windowsHere: number;
    /** Ctrl or the middle button asks for a new window. */
    newWindow: boolean;
}

export type ClickAction = 'default' | 'minimize' | 'cycle';

/**
 * What clicking an app in the dock does. GNOME's default launches or
 * raises the app; clicking the app that already has focus minimizes its
 * window, or moves to its next window when it has several.
 */
export function clickAction(state: ClickState): ClickAction {
    if (!state.running || !state.focused || state.newWindow || state.windowsHere === 0) return 'default';
    return state.windowsHere === 1 ? 'minimize' : 'cycle';
}
