import type Gio from 'gi://Gio';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { type Note, type NoteColor, parseNotes, serializeNotes } from './logic/notes.js';

/** The setting that holds the sticky notes, a JSON list, newest first. */
export const NOTES_KEY = 'widget-notes';

export function readNotes(settings: Gio.Settings): Note[] {
    return parseNotes(settings.get_string(NOTES_KEY));
}

export function saveNotes(settings: Gio.Settings, notes: readonly Note[]): void {
    const json = serializeNotes(notes);
    if (settings.get_string(NOTES_KEY) !== json) settings.set_string(NOTES_KEY, json);
}

/** A note colour's name, as macOS Stickies writes it. */
export function colorName(color: NoteColor): string {
    switch (color) {
        case 'yellow':
            return _('Yellow');
        case 'blue':
            return _('Blue');
        case 'green':
            return _('Green');
        case 'pink':
            return _('Pink');
        case 'purple':
            return _('Purple');
    }
}

/** Shows `color` on a note actor (`macr-note-<color>`), and no other. */
export function paintNote(actor: { add_style_class_name(name: string): void; remove_style_class_name(name: string): void }, color: NoteColor, all: readonly NoteColor[]): void {
    for (const other of all) actor.remove_style_class_name(`macr-note-${other}`);
    actor.add_style_class_name(`macr-note-${color}`);
}
