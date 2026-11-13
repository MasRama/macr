/** The sticky notes' colours, as macOS Stickies has them; yellow first. */
export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** A sticky note, as saved in `widget-notes` (a JSON list, newest first). */
export interface Note {
    id: string;
    text: string;
    color: NoteColor;
}

function isColor(value: unknown): value is NoteColor {
    return (NOTE_COLORS as readonly unknown[]).includes(value);
}

/** The notes in a saved JSON list; anything that is not a note is skipped. */
export function parseNotes(json: string): Note[] {
    let list: unknown;
    try {
        list = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const { id, text, color } = entry as Record<string, unknown>;
        if (typeof id !== 'string' || !id) return [];
        return [{ id, text: typeof text === 'string' ? text : '', color: isColor(color) ? color : 'yellow' }];
    });
}

export function serializeNotes(notes: readonly Note[]): string {
    return JSON.stringify(notes);
}

/** A new empty note in front of the others. */
export function addNote(notes: readonly Note[], id: string, color: NoteColor = 'yellow'): Note[] {
    return [{ id, text: '', color }, ...notes];
}

function changed(notes: Note[], id: string, change: Partial<Note>): Note[] {
    if (!notes.some((note) => note.id === id)) return notes;
    return notes.map((note) => (note.id === id ? { ...note, ...change } : note));
}

export function withText(notes: Note[], id: string, text: string): Note[] {
    return changed(notes, id, { text });
}

export function withColor(notes: Note[], id: string, color: NoteColor): Note[] {
    return changed(notes, id, { color });
}

export function removeNote(notes: readonly Note[], id: string): Note[] {
    return notes.filter((note) => note.id !== id);
}

/** When editing ends: the note goes if nothing was written in it. */
export function dropEmpty(notes: Note[], id: string): Note[] {
    const note = notes.find((one) => one.id === id);
    return note && note.text.trim() === '' ? removeNote(notes, id) : notes;
}

/** The note a widget shows: the one it showed while it is there, else the newest. */
export function shownNote(notes: readonly Note[], id: string | null): Note | null {
    return notes.find((note) => note.id === id) ?? notes[0] ?? null;
}

/** An id for a new note, from the time, not one of `taken`. */
export function newId(now: number, taken: readonly string[]): string {
    let id = `n${now}`;
    for (let n = 1; taken.includes(id); n++) id = `n${now}-${n}`;
    return id;
}
