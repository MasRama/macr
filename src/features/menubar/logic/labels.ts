/** The app menu's title: the focused app, or "Files" when nothing is focused, as macOS shows Finder. */
export function appLabel(appName: string | null): string {
    const name = appName?.trim();
    return name ? name : 'Files';
}

const MAX_TITLE = 60;

/** A window title short enough for the Window menu's list. */
export function shortTitle(title: string): string {
    const clean = title.trim();
    if (!clean) return 'Untitled';
    return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean;
}
