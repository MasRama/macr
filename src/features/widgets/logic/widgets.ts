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

/**
 * Where `count` widgets of `size` go before any is dragged: a column down
 * the right of the work area, `margin` in from its corner, the next column
 * to the left when one is full.
 */
export function defaultSlots(count: number, area: Rect, size: number, gap: number, margin: number): Point[] {
    const step = size + gap;
    const perColumn = Math.max(1, Math.floor((area.height - 2 * margin + gap) / step));
    const slots: Point[] = [];
    for (let i = 0; i < count; i++) {
        const column = Math.floor(i / perColumn);
        const row = i % perColumn;
        slots.push({ x: area.x + area.width - margin - size - column * step, y: area.y + margin + row * step });
    }
    return slots;
}

/** A dropped widget's place: on the `grid`, and wholly inside the work area. */
export function placeWidget(x: number, y: number, size: number, area: Rect, grid = 8): Point {
    const snap = (v: number, origin: number) => origin + Math.round((v - origin) / grid) * grid;
    const clamp = (v: number, low: number, high: number) => Math.min(Math.max(v, low), high);
    return {
        x: clamp(snap(x, area.x), area.x, area.x + area.width - size),
        y: clamp(snap(y, area.y), area.y, area.y + area.height - size),
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
