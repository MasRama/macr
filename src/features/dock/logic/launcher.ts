// The Unity launcher API (com.canonical.Unity.LauncherEntry): apps such as
// Telegram, Thunderbird and Chrome send a count and a progress for their
// dock icon. These functions read what they send.

/** What an app asked its dock icon to show. */
export interface LauncherEntry {
    count: number;
    countVisible: boolean;
    progress: number;
    progressVisible: boolean;
    urgent: boolean;
}

export const EMPTY_ENTRY: LauncherEntry = { count: 0, countVisible: false, progress: 0, progressVisible: false, urgent: false };

/** The desktop file id in an app uri: "application://firefox.desktop" is "firefox.desktop". */
export function appIdOf(uri: string): string | null {
    const id = uri.replace(/^\w+:\/\//, '');
    return id || null;
}

/** `entry` with the keys of one Update signal (unpacked a{sv}); unknown keys and wrong types are left out. */
export function mergeEntry(entry: LauncherEntry, properties: Record<string, unknown>): LauncherEntry {
    const next = { ...entry };
    const { count, progress } = properties;
    if (typeof count === 'number') next.count = count;
    if (typeof progress === 'number') next.progress = progress;
    if (typeof properties['count-visible'] === 'boolean') next.countVisible = properties['count-visible'];
    if (typeof properties['progress-visible'] === 'boolean') next.progressVisible = properties['progress-visible'];
    if (typeof properties.urgent === 'boolean') next.urgent = properties.urgent;
    return next;
}

/** The red badge's text, or null for none. */
export function badgeText(entry: LauncherEntry): string | null {
    if (!entry.countVisible) return null;
    const count = Math.floor(entry.count);
    if (!(count > 0)) return null;
    return count > 999 ? '999+' : String(count);
}

/** The progress bar's fill from 0 to 1, or null for none. */
export function progressOf(entry: LauncherEntry): number | null {
    if (!entry.progressVisible) return null;
    const progress = entry.progress;
    if (!(progress > 0)) return 0;
    return Math.min(progress, 1);
}
