import type { WidgetSize } from './widgets.js';

/** A reminder, as saved in `widget-reminders` (a JSON list, oldest first). */
export interface Reminder {
    id: string;
    text: string;
}

/** The reminders in a saved JSON list; anything that is not one is skipped. */
export function parseReminders(json: string): Reminder[] {
    let list: unknown;
    try {
        list = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const { id, text } = entry as Record<string, unknown>;
        return typeof id === 'string' && id && typeof text === 'string' ? [{ id, text }] : [];
    });
}

export function serializeReminders(list: readonly Reminder[]): string {
    return JSON.stringify(list);
}

/** A typed reminder at the end of the list; nothing for empty text. */
export function addReminder(list: Reminder[], id: string, text: string): Reminder[] {
    const trimmed = text.trim();
    return trimmed ? [...list, { id, text: trimmed }] : list;
}

/** Ticked off: done reminders leave the list, as macOS hides them. */
export function removeReminder(list: readonly Reminder[], id: string): Reminder[] {
    return list.filter((reminder) => reminder.id !== id);
}

/** How many reminders a widget of `size` lists above "New Reminder". */
export function remindersShown(size: WidgetSize): number {
    return size === 'large' ? 9 : 3;
}
