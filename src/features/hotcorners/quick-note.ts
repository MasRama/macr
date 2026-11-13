import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Editing } from '../../shared/editing.js';
import { addNote, dropEmpty, newId, NOTE_COLORS, withText } from '../../shared/logic/notes.js';
import { paintNote, readNotes, saveNotes } from '../../shared/notes.js';
import type { CornerName } from './logic/corners.js';

/** Logical pixels: the note's side and its distance from the corner. */
const SIDE = 240;
const INSET = 24;
const SAVE_DELAY = 400;
const FADE = 150;

/**
 * The Quick Note corner: a new yellow sticky note by the corner, on the
 * pointer's monitor and above the windows, ready to type in. It is one of
 * the Stickies notes (`widget-notes`), saved as you type; Esc or a click
 * outside puts it away, and an empty one is not kept.
 */
export class QuickNote {
    private card: St.Widget | null = null;
    private label: St.Label | null = null;
    private editing: Editing | null = null;
    private noteId: string | null = null;
    private saveId = 0;

    constructor(private readonly settings: Gio.Settings) {}

    /** Opens a note by `corner`, or puts away the one that is open. */
    toggle(corner: CornerName): void {
        if (this.card) {
            this.editing?.stop();
            return;
        }
        const notes = readNotes(this.settings);
        const id = newId(Date.now(), notes.map((note) => note.id));
        this.noteId = id;
        saveNotes(this.settings, addNote(notes, id));

        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const area = Main.layoutManager.getWorkAreaForMonitor(global.display.get_current_monitor());
        const side = SIDE * scale;
        const inset = INSET * scale;
        const card = new St.Widget({ style_class: 'macr-note macr-quick-note', reactive: true, width: side, height: side, layout_manager: new Clutter.BinLayout(), opacity: 0 });
        paintNote(card, 'yellow', NOTE_COLORS);
        const hint = new St.Label({ text: _('Type a note…'), style_class: 'macr-widget-stickies-hint', x_expand: true, y_align: Clutter.ActorAlign.START });
        const label = new St.Label({ style_class: 'macr-widget-stickies-text', x_expand: true, y_expand: true, y_align: Clutter.ActorAlign.START });
        const text = label.clutter_text;
        text.ellipsize = Pango.EllipsizeMode.NONE;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.single_line_mode = false;
        text.activatable = false;
        text.editable = true;
        text.reactive = true;
        text.connect('text-changed', () => {
            hint.visible = label.text === '';
            this.queueSave();
        });
        const page = new St.Widget({ style_class: 'macr-quick-note-page', layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true, clip_to_allocation: true });
        page.add_child(hint);
        page.add_child(label);
        card.add_child(page);
        Main.layoutManager.addTopChrome(card);
        card.set_position(
            corner.endsWith('left') ? area.x + inset : area.x + area.width - side - inset,
            corner.startsWith('top') ? area.y + inset : area.y + area.height - side - inset,
        );
        card.ease({ opacity: 255, duration: FADE, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        this.card = card;
        this.label = label;
        this.editing = new Editing(card);
        this.editing.start(text, () => this.close());
    }

    destroy(): void {
        this.editing?.stop();
        this.close();
    }

    private queueSave(): void {
        if (this.saveId) GLib.source_remove(this.saveId);
        this.saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY, () => {
            this.saveId = 0;
            this.save();
            return GLib.SOURCE_REMOVE;
        });
    }

    private save(): void {
        if (this.noteId && this.label) saveNotes(this.settings, withText(readNotes(this.settings), this.noteId, this.label.text));
    }

    /** Saves it, drops it when empty, and fades it out. */
    private close(): void {
        if (this.saveId) GLib.source_remove(this.saveId);
        this.saveId = 0;
        this.save();
        if (this.noteId) saveNotes(this.settings, dropEmpty(readNotes(this.settings), this.noteId));
        this.noteId = null;
        this.label = null;
        this.editing = null;
        const card = this.card;
        this.card = null;
        if (!card) return;
        card.ease({ opacity: 0, duration: FADE, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onStopped: () => card.destroy() });
    }
}
