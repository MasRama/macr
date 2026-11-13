import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Editing } from '../../shared/editing.js';
import { addNote, dropEmpty, newId, NOTE_COLORS, type NoteColor, removeNote, shownNote, withColor, withText } from '../../shared/logic/notes.js';
import { colorName, NOTES_KEY, paintNote, readNotes, saveNotes } from '../../shared/notes.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** Milliseconds of quiet typing before the note is saved. */
const SAVE_DELAY = 400;

/**
 * A sticky note: click it to type, and the text is saved as you type
 * (`widget-notes`). Its menu picks the colour, starts a new note or deletes
 * this one; with more than one note, arrows at the bottom page through them.
 */
export class StickiesWidget extends DesktopWidget {
    private readonly label: St.Label;
    private readonly hint: St.Label;
    private readonly pager: St.BoxLayout;
    private readonly page: St.Label;
    private readonly editing: Editing;
    private readonly colors = new Map<NoteColor, PopupMenu.PopupMenuItem>();
    private readonly remove: PopupMenu.PopupMenuItem;
    private readonly changedId: number;
    private noteId: string | null = null;
    private saveId = 0;
    private idleId = 0;
    private syncing = false;

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        this.actor.add_style_class_name('macr-note');
        const column = new St.BoxLayout({ style_class: 'macr-widget-stickies-box', vertical: true, x_expand: true, y_expand: true });
        const page = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true, clip_to_allocation: true });
        this.hint = new St.Label({ text: _('Type a note…'), style_class: 'macr-widget-stickies-hint', x_expand: true, y_align: Clutter.ActorAlign.START });
        this.label = new St.Label({ style_class: 'macr-widget-stickies-text', x_expand: true, y_expand: true, y_align: Clutter.ActorAlign.START });
        const text = this.label.clutter_text;
        text.ellipsize = Pango.EllipsizeMode.NONE;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.single_line_mode = false;
        text.activatable = false;
        // Clicks reach the widget (drag, menu, start typing) until editing starts.
        text.reactive = false;
        text.connect('text-changed', () => this.typed());
        page.add_child(this.hint);
        page.add_child(this.label);
        column.add_child(page);

        this.pager = new St.BoxLayout({ style_class: 'macr-widget-stickies-pager', x_align: Clutter.ActorAlign.END });
        this.page = new St.Label({ style_class: 'macr-widget-stickies-page', y_align: Clutter.ActorAlign.CENTER });
        this.pager.add_child(this.pageButton('go-previous-symbolic', -1));
        this.pager.add_child(this.page);
        this.pager.add_child(this.pageButton('go-next-symbolic', 1));
        column.add_child(this.pager);
        this.actor.add_child(column);
        this.editing = new Editing(this.actor);

        // Its own items above the sizes in the menu.
        let at = 0;
        const add = (item: PopupMenu.PopupBaseMenuItem) => this.menu.addMenuItem(item, at++);
        const fresh = new PopupMenu.PopupMenuItem(_('New Note'));
        fresh.connect('activate', () => this.newNote());
        add(fresh);
        add(new PopupMenu.PopupSeparatorMenuItem());
        for (const color of NOTE_COLORS) {
            const item = new PopupMenu.PopupMenuItem(colorName(color));
            item.connect('activate', () => this.setColor(color));
            add(item);
            this.colors.set(color, item);
        }
        add(new PopupMenu.PopupSeparatorMenuItem());
        this.remove = new PopupMenu.PopupMenuItem(_('Delete Note'));
        this.remove.connect('activate', () => this.deleteNote());
        add(this.remove);
        add(new PopupMenu.PopupSeparatorMenuItem());

        this.changedId = host.settings.connect(`changed::${NOTES_KEY}`, () => this.sync());
        this.sync();
    }

    override destroy(): void {
        this.host.settings.disconnect(this.changedId);
        if (this.idleId) GLib.source_remove(this.idleId);
        this.idleId = 0;
        this.editing.stop();
        this.flush();
        super.destroy();
    }

    protected override get opensApp(): boolean {
        return false;
    }

    /** A click starts typing in the note, a new one when there is none. */
    protected activate(): void {
        if (this.editing.active) return;
        if (!shownNote(readNotes(this.host.settings), this.noteId)) {
            this.newNote();
            return;
        }
        const text = this.label.clutter_text;
        text.editable = true;
        text.reactive = true;
        this.editing.start(text, () => this.stopped());
        text.set_cursor_position(-1);
        text.set_selection_bound(-1);
        this.actor.add_style_class_name('macr-editing');
    }

    private stopped(): void {
        const text = this.label.clutter_text;
        text.editable = false;
        text.reactive = false;
        this.actor.remove_style_class_name('macr-editing');
        this.flush();
        // Nothing written: the note goes.
        if (this.noteId) saveNotes(this.host.settings, dropEmpty(readNotes(this.host.settings), this.noteId));
    }

    private pageButton(icon: string, step: number): St.Button {
        const button = new St.Button({ style_class: 'macr-widget-stickies-arrow', can_focus: false, child: new St.Icon({ icon_name: icon }) });
        button.connect('clicked', () => {
            const notes = readNotes(this.host.settings);
            const index = notes.findIndex((note) => note.id === this.noteId);
            const next = notes[(index + step + notes.length) % notes.length];
            if (!next) return;
            this.editing.stop();
            this.noteId = next.id;
            this.sync();
        });
        return button;
    }

    private newNote(): void {
        this.editing.stop();
        const notes = readNotes(this.host.settings);
        const id = newId(Date.now(), notes.map((note) => note.id));
        this.noteId = id;
        saveNotes(this.host.settings, addNote(notes, id));
        // After the menu that asked for it has let go of the keyboard.
        if (!this.idleId) {
            this.idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.idleId = 0;
                this.activate();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    private setColor(color: NoteColor): void {
        if (this.noteId) saveNotes(this.host.settings, withColor(readNotes(this.host.settings), this.noteId, color));
    }

    private deleteNote(): void {
        if (!this.noteId) return;
        this.editing.stop();
        const id = this.noteId;
        this.noteId = null;
        saveNotes(this.host.settings, removeNote(readNotes(this.host.settings), id));
    }

    private typed(): void {
        this.hint.visible = this.label.text === '';
        if (this.syncing || !this.editing.active) return;
        if (this.saveId) GLib.source_remove(this.saveId);
        this.saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY, () => {
            this.saveId = 0;
            this.save();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Saves now what is waiting to be saved. */
    private flush(): void {
        if (!this.saveId) return;
        GLib.source_remove(this.saveId);
        this.saveId = 0;
        this.save();
    }

    private save(): void {
        if (this.noteId) saveNotes(this.host.settings, withText(readNotes(this.host.settings), this.noteId, this.label.text));
    }

    private sync(): void {
        const notes = readNotes(this.host.settings);
        const note = shownNote(notes, this.noteId);
        this.noteId = note?.id ?? null;
        // The text being typed stays as it is.
        if (!this.editing.active && this.label.text !== (note?.text ?? '')) {
            this.syncing = true;
            this.label.text = note?.text ?? '';
            this.syncing = false;
        }
        this.hint.visible = this.label.text === '';
        const color = note?.color ?? 'yellow';
        paintNote(this.actor, color, NOTE_COLORS);
        for (const [one, item] of this.colors) {
            item.setOrnament(note && one === color ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            item.setSensitive(note !== null);
        }
        this.remove.setSensitive(note !== null);
        const index = note ? notes.indexOf(note) : -1;
        this.pager.visible = notes.length > 1;
        this.page.text = `${index + 1}/${notes.length}`;
    }
}
