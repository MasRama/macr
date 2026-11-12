/**
 * Where the shell is: the desktop, the lock screen or the login screen
 * (GDM's greeter, a shell of its own run as the gdm user).
 */
export type Screen = 'desktop' | 'lock' | 'login';

/** The screen for a GNOME session mode. */
export function screenOf(mode: { isGreeter?: boolean; isLocked?: boolean }): Screen {
    if (mode.isGreeter) return 'login';
    if (mode.isLocked) return 'lock';
    return 'desktop';
}

/** Modules run on the desktop only unless they name other screens. */
export function runsOn(screens: readonly Screen[] | undefined, screen: Screen): boolean {
    return (screens ?? ['desktop']).includes(screen);
}
