import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import { wrapIndex } from '../spotlight/logic/results.js';
import { type Clip, type ClipboardHistory, thumbnailContent } from './history.js';
import { ageOf, previewText, searchClips } from './logic/history.js';
import { Paster } from './paste.js';

/** Logical px. */
const WIDTH = 600;
/** The thumbnail's box; text rows centre their icon in the same width. */
const THUMB = { width: 44, height: 30 };

type Easeable = { ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode }): void };

function ageText(at: number): string {
    const age = ageOf(Date.now(), at);
    switch (age.unit) {
        case 'now':
            return _('Just now');
        case 'minutes':
            return ngettext('%d minute ago', '%d minutes ago', age.count).format(age.count);
        case 'hours':
            return ngettext('%d hour ago', '%d hours ago', age.count).format(age.count);
    }
}

/**
 * The clipboard history, as Spotlight shows it on macOS Tahoe: a search
 * field over what was copied, newest first. Enter (or a click) puts the
 * clip back on the clipboard and pastes it into the app that had focus;
 * Delete takes it out of the history.
 */
export class ClipboardPanel {
    private readonly paster = new Paster();
    private root: St.Widget | null = null;
    private grab: Clutter.Grab | null = null;
    private entry: St.Entry | null = null;
    private list: St.BoxLayout | null = null;
    private scroll: St.ScrollView | null = null;
    private rows: { clip: Clip; button: St.Button }[] = [];
    private selected = -1;

    constructor(private readonly history: ClipboardHistory) {}

    get isOpen(): boolean {
        return this.root !== null;
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    destroy(): void {
        this.paster.destroy();
        this.close();
    }

    open(): void {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const light = isLight();
        const top = Math.round(monitor.height * 0.22);

        const root = new St.Widget({ reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        const panel = new St.BoxLayout({ vertical: true, style_class: light ? 'macr-spotlight macr-clipboard macr-light' : 'macr-spotlight macr-clipboard', width: WIDTH * scale });
        panel.set_position(Math.round((monitor.width - WIDTH * scale) / 2), top);
        const backdrop = new St.Widget({ style_class: light ? 'macr-spotlight-backdrop macr-light' : 'macr-spotlight-backdrop' });
        backdrop.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
        backdrop.add_constraint(new Clutter.BindConstraint({ source: panel, coordinate: Clutter.BindCoordinate.ALL }));
        root.add_child(backdrop);
        root.add_child(panel);

        const entry = new St.Entry({ style_class: 'macr-spotlight-entry', hint_text: _('Search Clipboard'), can_focus: true, x_expand: true });
        entry.set_primary_icon(new St.Icon({ icon_name: 'edit-paste-symbolic', style_class: 'macr-spotlight-icon' }));
        panel.add_child(entry);
        const scroll = new St.ScrollView({
            style_class: 'macr-spotlight-results',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            style: `max-height: ${Math.round((monitor.height - top) / scale - 180)}px;`,
        });
        const list = new St.BoxLayout({ vertical: true });
        scroll.set_child(list);
        panel.add_child(scroll);
        const footer = new St.BoxLayout({ style_class: 'macr-clipboard-footer' });
        footer.add_child(new St.Label({ text: _('Kept for 8 hours, never saved to disk'), style_class: 'macr-clipboard-note', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
        const clear = new St.Button({ label: _('Clear History'), style_class: 'macr-clipboard-clear', can_focus: false });
        clear.connect('clicked', () => {
            this.history.clear();
            this.fill();
        });
        footer.add_child(clear);
        panel.add_child(footer);

        this.root = root;
        this.entry = entry;
        this.list = list;
        this.scroll = scroll;

        root.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            const target = (global.stage as Clutter.Stage).get_event_actor(event);
            if (target && panel.contains(target)) return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
        entry.clutter_text.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onKey(event));
        entry.clutter_text.connect('text-changed', () => this.fill());
        this.fill();

        Main.layoutManager.uiGroup.add_child(root);
        const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this.close();
            return;
        }
        this.grab = grab;
        (global.stage as Clutter.Stage).set_key_focus(entry.clutter_text);
        for (const actor of [panel, backdrop]) {
            actor.opacity = 0;
            (actor as unknown as Easeable).ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        }
    }

    close(): void {
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
        this.root?.destroy();
        this.root = null;
        this.entry = null;
        this.list = null;
        this.scroll = null;
        this.rows = [];
        this.selected = -1;
    }

    private fill(): void {
        const list = this.list;
        if (!list) return;
        list.destroy_all_children();
        this.rows = [];
        const query = this.entry?.get_text() ?? '';
        const all = this.history.list();
        const clips = searchClips(all, query);
        if (!clips.length) {
            const text = all.length ? _('No Results') : _('Nothing copied in the last 8 hours');
            list.add_child(new St.Label({ text, style_class: 'macr-clipboard-empty', x_align: Clutter.ActorAlign.CENTER }));
        }
        for (const clip of clips) this.addRow(list, clip);
        this.select(this.rows.length ? 0 : -1);
    }

    private addRow(list: St.BoxLayout, clip: Clip): void {
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const box = new St.BoxLayout({ style_class: 'macr-spotlight-row-box', x_expand: true });
        const pixbuf = clip.image?.thumbnail;
        if (pixbuf) {
            const fit = Math.min((THUMB.width * scale) / pixbuf.get_width(), (THUMB.height * scale) / pixbuf.get_height(), 1);
            const thumb = new St.Widget({
                style_class: 'macr-clipboard-thumb',
                width: Math.round(pixbuf.get_width() * fit),
                height: Math.round(pixbuf.get_height() * fit),
                content: thumbnailContent(pixbuf),
                y_align: Clutter.ActorAlign.CENTER,
            });
            const frame = new St.Bin({ child: thumb, width: THUMB.width * scale, y_align: Clutter.ActorAlign.CENTER });
            box.add_child(frame);
        } else {
            const icon = new St.Icon({ icon_name: clip.kind === 'image' ? 'image-x-generic-symbolic' : 'text-x-generic-symbolic', icon_size: 22 });
            box.add_child(new St.Bin({ child: icon, width: THUMB.width * scale, y_align: Clutter.ActorAlign.CENTER }));
        }
        const name = new St.Label({ text: clip.kind === 'image' ? _('Image') : previewText(clip.text), style_class: 'macr-spotlight-name', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(name);
        box.add_child(new St.Label({ text: ageText(clip.at), style_class: 'macr-spotlight-description macr-clipboard-age', y_align: Clutter.ActorAlign.CENTER }));
        const button = new St.Button({ style_class: 'macr-spotlight-row', child: box, can_focus: false, x_expand: true });
        const index = this.rows.length;
        button.connect('clicked', () => this.paste(clip));
        button.connect('notify::hover', () => {
            if (button.hover) this.select(index);
        });
        list.add_child(button);
        this.rows.push({ clip, button });
    }

    private select(index: number, reveal = false): void {
        this.selected = index;
        this.rows.forEach((row, at) => {
            if (at === index) row.button.add_style_pseudo_class('selected');
            else row.button.remove_style_pseudo_class('selected');
        });
        const row = this.rows[index];
        if (reveal && row && this.scroll) ensureActorVisibleInScrollView(this.scroll, row.button);
    }

    private onKey(event: Clutter.Event): boolean {
        switch (event.get_key_symbol()) {
            case Clutter.KEY_Escape:
                if (this.entry?.get_text()) this.entry.set_text('');
                else this.close();
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter: {
                const row = this.rows[this.selected];
                if (row) this.paste(row.clip);
                return Clutter.EVENT_STOP;
            }
            case Clutter.KEY_Down:
                this.select(wrapIndex(this.selected, 1, this.rows.length), true);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Up:
                this.select(wrapIndex(this.selected, -1, this.rows.length), true);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Delete: {
                // In the search field Delete edits its text.
                const row = this.rows[this.selected];
                if (this.entry?.get_text() || !row) return Clutter.EVENT_PROPAGATE;
                this.history.remove(row.clip.key);
                const at = this.selected;
                this.fill();
                this.select(Math.min(at, this.rows.length - 1), true);
                return Clutter.EVENT_STOP;
            }
            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }

    /** Back on the clipboard, then pasted into the app that has focus again. */
    private paste(clip: Clip): void {
        const clipboard = St.Clipboard.get_default();
        if (clip.image) clipboard.set_content(St.ClipboardType.CLIPBOARD, clip.image.mimetype, clip.image.bytes);
        else clipboard.set_text(St.ClipboardType.CLIPBOARD, clip.text);
        this.close();
        this.paster.paste((pasted) => {
            if (!pasted) Main.osdWindowManager.show(-1, new Gio.ThemedIcon({ name: 'edit-copy-symbolic' }), _('Copied'), null, null);
        });
    }
}
