/** The widgets Macr can put on the desktop. */
export const WIDGET_IDS = ['clock', 'calendar', 'weather', 'batteries', 'photos'] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

/** The widgets a setting lists that Macr knows, each once, in its order. */
export function widgetIds(list: readonly string[]): WidgetId[] {
    const ids: WidgetId[] = [];
    for (const id of list) if ((WIDGET_IDS as readonly string[]).includes(id) && !ids.includes(id as WidgetId)) ids.push(id as WidgetId);
    return ids;
}

export type WidgetSize = 'small' | 'medium';

/** The sizes macOS has for each widget; the first is the default. */
const SIZES: Record<WidgetId, WidgetSize[]> = {
    clock: ['small'],
    calendar: ['small', 'medium'],
    weather: ['small', 'medium'],
    batteries: ['small', 'medium'],
    photos: ['small', 'medium'],
};

export function sizesOf(id: WidgetId): WidgetSize[] {
    return SIZES[id];
}

/** The size a widget shows at: the one saved for it when it has that size, else small. */
export function widgetSize(id: WidgetId, saved: string | undefined): WidgetSize {
    return (SIZES[id] as string[]).includes(saved ?? '') ? (saved as WidgetSize) : 'small';
}

export interface Box {
    width: number;
    height: number;
}

/** A small widget is `unit` square; a medium one is two of them and the `gap` wide. */
export function boxOf(size: WidgetSize, unit: number, gap: number): Box {
    return size === 'medium' ? { width: 2 * unit + gap, height: unit } : { width: unit, height: unit };
}

/**
 * Where widgets go before any is dragged: a column down the right of the
 * work area, `margin` in from its corner, each against the column's right
 * edge; the next column starts left of the widest one when one is full.
 */
export function defaultSlots(boxes: readonly Box[], area: Rect, gap: number, margin: number): Point[] {
    const slots: Point[] = [];
    let right = area.x + area.width - margin;
    let y = area.y + margin;
    let widest = 0;
    for (const box of boxes) {
        if (widest > 0 && y + box.height > area.y + area.height - margin) {
            right -= widest + gap;
            y = area.y + margin;
            widest = 0;
        }
        slots.push({ x: right - box.width, y });
        y += box.height + gap;
        widest = Math.max(widest, box.width);
    }
    return slots;
}

/** A dropped widget's place: on the `grid`, and wholly inside the work area. */
export function placeWidget(x: number, y: number, box: Box, area: Rect, grid = 8): Point {
    const snap = (v: number, origin: number) => origin + Math.round((v - origin) / grid) * grid;
    const clamp = (v: number, low: number, high: number) => Math.min(Math.max(v, low), high);
    return {
        x: clamp(snap(x, area.x), area.x, area.x + area.width - box.width),
        y: clamp(snap(y, area.y), area.y, area.y + area.height - box.height),
    };
}

/** A place as fractions of the work area, so it survives a change of screen. */
export function toFraction(point: Point, area: Rect): [number, number] {
    return [(point.x - area.x) / area.width, (point.y - area.y) / area.height];
}

export function fromFraction([fx, fy]: readonly [number, number], area: Rect): Point {
    return { x: Math.round(area.x + fx * area.width), y: Math.round(area.y + fy * area.height) };
}

/**
 * A month's days by week, for `month` 1–12, weeks starting on
 * `firstWeekday` (0 Sunday … 6 Saturday); null where a week runs outside it.
 */
export function monthGrid(year: number, month: number, firstWeekday: number): (number | null)[][] {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() - firstWeekday + 7) % 7;
    const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

/** Clock hand angles in degrees, clockwise from 12. */
export function handAngles(hours: number, minutes: number, seconds: number): { hour: number; minute: number; second: number } {
    return {
        hour: ((hours % 12) + minutes / 60) * 30,
        minute: (minutes + seconds / 60) * 6,
        second: seconds * 6,
    };
}

/** A time zone's city in three letters, as the macOS clock widget shows it: Asia/Jakarta is JAK. */
export function cityCode(zone: string): string {
    const city = zone.split('/').pop() ?? '';
    return city.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

/** Today's low and high, rounded, from the temperatures known for it. */
export function dayRange(temperatures: readonly number[]): { low: number; high: number } | null {
    if (temperatures.length === 0) return null;
    return { low: Math.round(Math.min(...temperatures)), high: Math.round(Math.max(...temperatures)) };
}

/**
 * Whether a window is a desktop-icons window by its title: on Wayland the
 * Desktop Icons extensions (DING, Zorin's) give theirs a title starting
 * "Desktop Icons ", or "@!" flags with B (kept at the bottom).
 */
export function isDesktopIconsTitle(title: string | null): boolean {
    if (!title) return false;
    if (title.startsWith('Desktop Icons ')) return true;
    const flags = title.indexOf('@!');
    return flags >= 0 && /B/i.test(title.slice(flags + 2).replace(/^[^;]*;/, ''));
}

export interface WidgetEvent {
    summary: string;
    /** Milliseconds since the epoch. */
    start: number;
    end: number;
}

/** A local midnight, as Date.getTime(). */
function isMidnight(ms: number): boolean {
    const date = new Date(ms);
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

/** The local day `ms` falls on, as its midnight's Date.getTime(). */
function dayOf(ms: number): number {
    return new Date(ms).setHours(0, 0, 0, 0);
}

/**
 * The events the medium calendar lists: those not over at `now`, day by
 * day (one already under way counts as today's), each day's all-day ones
 * first, then by start, at most `limit`.
 */
export function upcomingEvents<T extends WidgetEvent>(events: readonly T[], now: number, limit: number): (T & { allDay: boolean })[] {
    return events
        .filter((event) => event.end > now)
        .map((event) => ({ ...event, allDay: isMidnight(event.start) && isMidnight(event.end) && event.end > event.start }))
        .sort((a, b) => dayOf(Math.max(a.start, now)) - dayOf(Math.max(b.start, now)) || Number(b.allDay) - Number(a.allDay) || a.start - b.start)
        .slice(0, limit);
}

export interface ForecastItem {
    /** Seconds since the epoch. */
    time: number;
    temperature: number;
    icon: string;
}

/** The next `count` hours' forecast after `now` (seconds), one per hour. */
export function hourlyForecast<T extends ForecastItem>(items: readonly T[], now: number, count: number): T[] {
    const next: T[] = [];
    let last = -Infinity;
    for (const item of [...items].sort((a, b) => a.time - b.time)) {
        if (item.time <= now || item.time - last < 3600) continue;
        next.push(item);
        last = item.time;
        if (next.length === count) break;
    }
    return next;
}

