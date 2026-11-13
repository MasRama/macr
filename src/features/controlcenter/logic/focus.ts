/**
 * macOS Focus: Do Not Disturb, Work, Personal and Sleep, each letting some
 * apps' banners through and with an optional daily schedule. `''` is no
 * Focus.
 */
export const FOCUS_MODES = ['dnd', 'work', 'personal', 'sleep'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

export function isFocusMode(value: string): value is FocusMode {
    return (FOCUS_MODES as readonly string[]).includes(value);
}

/** The apps allowed in `mode`, from `focus-allowed-apps` (`mode:app-id.desktop`). */
export function allowedApps(saved: readonly string[], mode: FocusMode): string[] {
    const prefix = `${mode}:`;
    return saved.filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length));
}

/** The saved list with `appId` allowed in `mode`, or not. */
export function withAllowed(saved: readonly string[], mode: FocusMode, appId: string, allow: boolean): string[] {
    const entry = `${mode}:${appId}`;
    const others = saved.filter((other) => other !== entry);
    return allow ? (saved.includes(entry) ? [...saved] : [...saved, entry]) : others;
}

const bare = (id: string) => id.replace(/\.desktop$/, '');

/** Whether a notification source (GNOME's policy id, the app id without `.desktop`) may show banners in `mode`. */
export function allows(saved: readonly string[], mode: FocusMode, sourceId: string): boolean {
    return allowedApps(saved, mode).some((app) => bare(app) === bare(sourceId));
}

/** GNOME's `show-banners` while `mode` is on: any Focus is GNOME's Do Not Disturb, with Macr's exceptions. */
export function bannersFor(mode: FocusMode | ''): boolean {
    return mode === '';
}

/** The mode after GNOME's own Do Not Disturb changed, or null when the two agree. */
export function modeForBanners(showBanners: boolean, mode: FocusMode | ''): FocusMode | '' | null {
    if (showBanners === bannersFor(mode)) return null;
    return showBanners ? '' : 'dnd';
}

export interface Schedule {
    mode: FocusMode;
    on: boolean;
    /** Minutes after midnight. */
    start: number;
    end: number;
}

function minutes(text: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(text);
    if (!match) return null;
    const [hours, mins] = [Number(match[1]), Number(match[2])];
    return hours < 24 && mins < 60 ? hours * 60 + mins : null;
}

function clock(total: number): string {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** `focus-schedules` entries (`mode=on|off,HH:MM,HH:MM`, every day), bad ones dropped. */
export function parseSchedules(saved: readonly string[]): Schedule[] {
    const schedules: Schedule[] = [];
    for (const entry of saved) {
        const match = /^(\w+)=(on|off),([^,]+),([^,]+)$/.exec(entry);
        if (!match || !isFocusMode(match[1])) continue;
        const start = minutes(match[3]);
        const end = minutes(match[4]);
        if (start === null || end === null) continue;
        schedules.push({ mode: match[1], on: match[2] === 'on', start, end });
    }
    return schedules;
}

/** The saved list with `schedule` in place of its mode's. */
export function withSchedule(saved: readonly string[], schedule: Schedule): string[] {
    const entry = `${schedule.mode}=${schedule.on ? 'on' : 'off'},${clock(schedule.start)},${clock(schedule.end)}`;
    const at = saved.findIndex((other) => other.startsWith(`${schedule.mode}=`));
    if (at < 0) return [...saved, entry];
    return saved.map((other, index) => (index === at ? entry : other));
}

/** The mode a turned-on schedule wants at `now` (minutes after midnight); windows can run over midnight. */
export function scheduledMode(schedules: readonly Schedule[], now: number): FocusMode | null {
    for (const { mode, on, start, end } of schedules) {
        if (!on || start === end) continue;
        const inside = start < end ? now >= start && now < end : now >= start || now < end;
        if (inside) return mode;
    }
    return null;
}

/**
 * What the schedules do when the scheduled mode goes from `before` to
 * `after`: turn the new one on, or the old one off at its end, unless it was
 * turned off or changed by hand. Null leaves the active mode alone.
 */
export function scheduleStep(before: FocusMode | null, after: FocusMode | null, active: FocusMode | ''): FocusMode | '' | null {
    if (before === after) return null;
    if (after !== null) return after;
    return active === before ? '' : null;
}
