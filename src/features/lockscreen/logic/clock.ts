/**
 * GLib.DateTime format for the big lock screen time. macOS shows it without
 * AM/PM, in 12-hour or 24-hour form as the clock is set.
 */
export function lockTimeFormat(use24h: boolean): string {
    return use24h ? '%H:%M' : '%-l:%M';
}

/** The date above the time, "Thursday 13 November"; names follow LC_TIME. */
export const LOCK_DATE_FORMAT = '%A %-d %B';
