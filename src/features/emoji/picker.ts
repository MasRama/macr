import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import { EMOJI_DATA } from './logic/data.js';
import { CATEGORIES, type Category, type Emoji, inCategory, parseEmoji, pushRecent, searchEmoji } from './logic/emoji.js';

const RECENT_KEY = 'emoji-recent';
/** Logical px: the panel's width and the list's height. */
const WIDTH = 340;
const LIST_HEIGHT = 250;
const COLUMNS = 9;
/** How long to wait for the app's text field to take the keyboard back. */
const FOCUS_WAIT_MS = 600;
const FOCUS_POLL_MS = 20;

type Easeable = { ease(props: Record<string, unknown>): void };
type CursorRect = { x: number; y: number; width: number; height: number };
/** GNOME 46's input method: what it knows of the focused text field. */
type InputMethod = Clutter.InputMethod & { currentFocus: unknown; _cursorRect?: CursorRect };

function categoryTitle(category: Category): string {
    switch (category) {
        case 'recent':
            return _('Frequently Used');
        case 'people':
            return _('Smileys & People');
        case 'nature':
            return _('Animals & Nature');
        case 'food':
            return _('Food & Drink');
        case 'activity':
            return _('Activity');
        case 'travel':
            return _('Travel & Places');
        case 'objects':
            return _('Objects');
        case 'symbols':
            return _('Symbols');
        case 'flags':
            return _('Flags');
    }
}

/** Adwaita's own emoji category icons, as GTK's emoji chooser uses. */
const CATEGORY_ICONS: Record<Category, string> = {
    recent: 'emoji-recent-symbolic',
    people: 'emoji-people-symbolic',
    nature: 'emoji-nature-symbolic',
    food: 'emoji-food-symbolic',
    activity: 'emoji-activities-symbolic',
    travel: 'emoji-travel-symbolic',
    objects: 'emoji-objects-symbolic',
    symbols: 'emoji-symbols-symbolic',
    flags: 'emoji-flags-symbolic',
};

/**
 * macOS's emoji picker (Edit > Emoji & Symbols): a search field, the
 * emoji of one category and the category bar. It opens at the text cursor
 * when the app reports it. A pick goes into the app's text field through
 * GNOME's input method, as the on-screen keyboard types; with no text field
 * to take it, it is copied instead.
 */
export class EmojiPicker {
    private readonly all = parseEmoji(EMOJI_DATA);
    private root: St.Widget | null = null;
    private grab: Clutter.Grab | null = null;
    private entry: St.Entry | null = null;
    private heading: St.Label | null = null;
    private list: St.BoxLayout | null = null;
    private scroll: St.ScrollView | null = null;
    private tabs = new Map<Category, St.Button>();
    private category: Category = 'people';
    private shown: { emoji: Emoji; button: St.Button }[] = [];
    private selected = -1;
    private insertId = 0;

    constructor(private readonly settings: Gio.Settings) {}

    get isOpen(): boolean {
        return this.root !== null;
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    destroy(): void {
        if (this.insertId) GLib.source_remove(this.insertId);
        this.insertId = 0;
        this.close();
    }

    open(): void {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const inputMethod = Main.inputMethod as InputMethod;
        const caret = inputMethod.currentFocus ? inputMethod._cursorRect : undefined;

        const root = new St.Widget({ reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        const panel = new St.BoxLayout({ vertical: true, style_class: isLight() ? 'macr-emoji macr-light' : 'macr-emoji', width: WIDTH * scale, reactive: true });
        panel.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
        root.add_child(panel);

        const entry = new St.Entry({ style_class: 'macr-emoji-search', hint_text: _('Search'), can_focus: true, x_expand: true });
        entry.set_primary_icon(new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'macr-emoji-search-icon' }));
        panel.add_child(entry);
        const heading = new St.Label({ style_class: 'macr-emoji-heading' });
        panel.add_child(heading);
        const scroll = new St.ScrollView({
            style_class: 'macr-emoji-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            height: LIST_HEIGHT * scale,
        });
        const list = new St.BoxLayout({ vertical: true, style_class: 'macr-emoji-list' });
        scroll.set_child(list);
        panel.add_child(scroll);
        const bar = new St.BoxLayout({ style_class: 'macr-emoji-tabs' });
        this.tabs.clear();
        for (const category of CATEGORIES) {
            const tab = new St.Button({ style_class: 'macr-emoji-tab', can_focus: false, track_hover: true, x_expand: true, accessible_name: categoryTitle(category) });
            tab.set_child(new St.Icon({ icon_name: CATEGORY_ICONS[category], style_class: 'macr-emoji-tab-icon' }));
            tab.connect('clicked', () => {
                entry.text = '';
                this.showCategory(category);
            });
            bar.add_child(tab);
            this.tabs.set(category, tab);
        }
        panel.add_child(bar);

        this.root = root;
        this.entry = entry;
        this.heading = heading;
        this.list = list;
        this.scroll = scroll;

        root.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            const target = (global.stage as Clutter.Stage).get_event_actor(event);
            if (target && panel.contains(target)) return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
        entry.clutter_text.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onKey(event));
        entry.clutter_text.connect('text-changed', () => this.onSearch());

        const recent = this.settings.get_strv(RECENT_KEY);
        this.showCategory(recent.length ? 'recent' : 'people');

        Main.layoutManager.uiGroup.add_child(root);
        const [, height] = panel.get_preferred_height(WIDTH * scale);
        panel.set_position(...this.placement(caret, monitor, WIDTH * scale, height, scale));
        const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this.close();
            return;
        }
        this.grab = grab;
        (global.stage as Clutter.Stage).set_key_focus(entry.clutter_text);
        panel.opacity = 0;
        (panel as unknown as Easeable).ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    close(): void {
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
        this.root?.destroy();
        this.root = null;
        this.entry = null;
        this.heading = null;
        this.list = null;
        this.scroll = null;
        this.tabs.clear();
        this.shown = [];
        this.selected = -1;
    }

    /** Under the text cursor when the app reports one, else in the upper middle of the monitor; on screen either way. */
    private placement(caret: CursorRect | undefined, monitor: { x: number; y: number; width: number; height: number }, width: number, height: number, scale: number): [number, number] {
        const gap = 6 * scale;
        let x = monitor.width / 2 - width / 2;
        let y = monitor.height * 0.25;
        if (caret && (caret.width > 0 || caret.height > 0)) {
            x = caret.x - monitor.x - 20 * scale;
            y = caret.y - monitor.y + caret.height + gap;
            // No room under the cursor: above it.
            if (y + height > monitor.height) y = caret.y - monitor.y - height - gap;
        }
        x = Math.min(Math.max(x, gap), monitor.width - width - gap);
        y = Math.min(Math.max(y, gap), monitor.height - height - gap);
        return [Math.round(x), Math.round(y)];
    }

    private showCategory(category: Category): void {
        this.category = category;
        for (const [other, tab] of this.tabs) {
            if (other === category) tab.add_style_pseudo_class('checked');
            else tab.remove_style_pseudo_class('checked');
        }
        this.fill(inCategory(this.all, category, this.settings.get_strv(RECENT_KEY)), categoryTitle(category));
    }

    private onSearch(): void {
        const query = this.entry?.text.trim() ?? '';
        if (!query) {
            this.showCategory(this.category);
            return;
        }
        for (const tab of this.tabs.values()) tab.remove_style_pseudo_class('checked');
        const found = searchEmoji(this.all, query);
        this.fill(found, found.length ? _('Search Results') : _('No Results'));
        this.select(found.length ? 0 : -1);
    }

    /** Shows `emoji` in rows under `title`. */
    private fill(emoji: Emoji[], title: string): void {
        const list = this.list;
        const heading = this.heading;
        if (!list || !heading) return;
        list.destroy_all_children();
        heading.text = title;
        this.shown = [];
        this.selected = -1;
        let row: St.BoxLayout | null = null;
        emoji.forEach((item, index) => {
            if (index % COLUMNS === 0) {
                row = new St.BoxLayout({ style_class: 'macr-emoji-row' });
                list.add_child(row);
            }
            const button = new St.Button({ style_class: 'macr-emoji-cell', can_focus: false, track_hover: true, accessible_name: item.name });
            button.set_child(new St.Label({ text: item.char, style_class: 'macr-emoji-char' }));
            button.connect('clicked', () => this.pick(item));
            button.connect('notify::hover', () => {
                if (this.heading) this.heading.text = button.hover ? item.name : title;
            });
            (row as St.BoxLayout | null)?.add_child(button);
            this.shown.push({ emoji: item, button });
        });
        this.scroll?.vadjustment.set_value(0);
    }

    private select(index: number): void {
        this.shown[this.selected]?.button.remove_style_pseudo_class('selected');
        this.selected = index;
        const chosen = this.shown[index];
        if (!chosen) return;
        chosen.button.add_style_pseudo_class('selected');
        if (this.heading) this.heading.text = chosen.emoji.name;
        // Keep it in view.
        const adjustment = this.scroll?.vadjustment;
        const row = chosen.button.get_parent();
        if (adjustment && row) {
            const top = row.y;
            const bottom = top + row.height;
            const value = adjustment.value;
            if (top < value) adjustment.set_value(top);
            else if (bottom > value + adjustment.page_size) adjustment.set_value(bottom - adjustment.page_size);
        }
    }

    private onKey(event: Clutter.Event): boolean {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            const chosen = this.shown[Math.max(this.selected, 0)];
            if (chosen) this.pick(chosen.emoji);
            return Clutter.EVENT_STOP;
        }
        const moves = new Map<number, number>([
            [Clutter.KEY_Right, 1],
            [Clutter.KEY_Left, -1],
            [Clutter.KEY_Down, COLUMNS],
            [Clutter.KEY_Up, -COLUMNS],
        ]);
        const move = moves.get(key);
        // Left and Right stay in the search field while it has text.
        if (move === undefined || (Math.abs(move) === 1 && this.entry?.text && this.selected < 0)) return Clutter.EVENT_PROPAGATE;
        if (!this.shown.length) return Clutter.EVENT_STOP;
        const from = this.selected < 0 ? 0 : this.selected + move;
        this.select(Math.min(Math.max(from, 0), this.shown.length - 1));
        return Clutter.EVENT_STOP;
    }

    private pick(emoji: Emoji): void {
        this.settings.set_strv(RECENT_KEY, pushRecent(this.settings.get_strv(RECENT_KEY), emoji.char));
        this.close();
        this.insert(emoji.char);
    }

    /** Types `text` into the app once its text field has the keyboard back; copies it when there is none. */
    private insert(text: string): void {
        if (this.insertId) GLib.source_remove(this.insertId);
        const inputMethod = Main.inputMethod as InputMethod;
        let waited = 0;
        this.insertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_POLL_MS, () => {
            waited += FOCUS_POLL_MS;
            if (inputMethod.currentFocus) {
                inputMethod.commit(text);
            } else if (waited < FOCUS_WAIT_MS) {
                return GLib.SOURCE_CONTINUE;
            } else {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
                Main.osdWindowManager.show(-1, new Gio.ThemedIcon({ name: 'edit-copy-symbolic' }), _('Copied'), null, null);
            }
            this.insertId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }
}
