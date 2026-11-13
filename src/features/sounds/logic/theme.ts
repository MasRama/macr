/** The sound theme Macr installs, in the user's data folder under sounds/. */
export const THEME = 'macr';

export interface TakeTheme {
    /** The user's theme to remember, or null to keep what is saved. */
    save: string | null;
    /** The theme to switch to, or null when it is already on. */
    switchTo: string | null;
}

/** What to do with org.gnome.desktop.sound theme-name when the module starts. */
export function takeTheme(current: string): TakeTheme {
    if (current === THEME) return { save: null, switchTo: null };
    return { save: current, switchTo: THEME };
}

/** Macr's index.theme: its own sounds, the user's theme for the rest. */
export function indexTheme(inherits: string): string {
    const lines = ['[Sound Theme]', 'Name=Macr', 'Comment=macOS-style system sounds from Macr'];
    if (inherits && inherits !== THEME) lines.push(`Inherits=${inherits}`);
    lines.push('Directories=stereo', '', '[stereo]', 'OutputProfile=stereo', '');
    return lines.join('\n');
}
