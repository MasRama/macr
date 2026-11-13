import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Rect } from '../../shared/logic/geometry.js';
import { isLight } from '../../shared/scheme.js';
import { layoutWindows } from './logic/layout.js';

const OPEN_MS = 250;
const CLOSE_MS = 200;
/** Logical pixels: room at the top and sides, at the bottom (over the dock), the gap between windows, the minimized row. */
const MARGIN = 48;
const BOTTOM = 100;
const GAP = 28;
const STRIP = 150;

type Easeable = {
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void;
};

interface Card {
    window: Meta.Window;
    button: St.Button;
    /** Where the card rests, relative to the overlay. */
    slot: Rect;
    /** The window's frame, relative to the overlay; null for a minimized window. */
    from: Rect | null;
    /** The frame's width: the card's scale is slot / frame. */
    frameWidth: number;
}

/** An app's normal windows on the active workspace, most recently used first. */
export function exposedWindows(app: Shell.App): Meta.Window[] {
    const workspace = global.workspace_manager.get_active_workspace();
    const ours = new Set(app.get_windows());
    return global.display
        .get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter((window) => ours.has(window) && !window.skip_taskbar);
}

/**
 * App Exposé: one app's windows spread over the blurred, dimmed screen of
 * the monitor under the pointer; minimized ones in a smaller row at the
 * bottom. Clicking one brings it forward; Escape or a click elsewhere
 * closes. The cards are window previews, so minimized windows show too.
 */
export class ExposeOverlay {
    private root: St.Widget | null = null;
    private title: St.Label | null = null;
    private highlight: St.Widget | null = null;
    private grab: Clutter.Grab | null = null;
    private cards: Card[] = [];
    private closing = false;
    private app: Shell.App | null = null;

    get isOpen(): boolean {
        return this.root !== null && !this.closing;
    }

    /** Opens for `app`, or closes when it is already open for it. */
    toggle(app: Shell.App): void {
        if (this.isOpen && this.app === app) this.close(null);
        else this.open(app);
    }

    /** Opens for `app`; `tracked` leaves the cards on the windows for track() to move. */
    open(app: Shell.App, tracked = false): void {
        if (this.root) this.finish();
        const windows = exposedWindows(app);
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (windows.length === 0 || !monitor || Main.overview.visible) return;
        this.app = app;
        this.closing = false;

        const root = new St.Widget({ style_class: 'macr-expose', reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        if (isLight()) root.add_style_class_name('macr-light');
        const backdrop = new St.Widget({ style_class: 'macr-expose-backdrop', width: monitor.width, height: monitor.height });
        backdrop.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.85 }));
        root.add_child(backdrop);
        this.root = root;

        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const work = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const shown = windows.filter((w) => !w.minimized);
        const minimized = windows.filter((w) => w.minimized);
        const stripHeight = minimized.length ? STRIP * scale : 0;
        const top = work.y - monitor.y + MARGIN * scale;
        const main: Rect = {
            x: work.x - monitor.x + MARGIN * scale,
            y: top,
            width: work.width - 2 * MARGIN * scale,
            height: work.height - (MARGIN + BOTTOM) * scale - stripHeight,
        };
        const strip: Rect = { x: main.x, y: main.y + main.height + MARGIN * scale * 0.5, width: main.width, height: stripHeight - MARGIN * scale * 0.5 };

        const place = (list: Meta.Window[], area: Rect) => {
            const frames = list.map((w) => w.get_frame_rect());
            const slots = layoutWindows(frames, area, GAP * scale);
            list.forEach((window, i) => {
                const frame = frames[i];
                const from = window.minimized ? null : { x: frame.x - monitor.x, y: frame.y - monitor.y, width: frame.width, height: frame.height };
                this.cards.push(this.card(window, slots[i], from, frame.width));
            });
        };
        // The bottom of the stack first, so the most recent window is on top.
        place([...shown].reverse(), main);
        if (minimized.length) place(minimized, strip);

        this.highlight = new St.Widget({ style_class: 'macr-expose-highlight', opacity: 0 });
        root.add_child(this.highlight);
        this.title = new St.Label({ style_class: 'macr-expose-title', opacity: 0 });
        root.add_child(this.title);

        root.connect('button-press-event', () => {
            this.close(null);
            return Clutter.EVENT_STOP;
        });
        root.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
            this.close(null);
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.uiGroup.add_child(root);
        const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this.finish();
            return;
        }
        this.grab = grab;

        backdrop.opacity = 0;
        if (tracked) return;
        (backdrop as unknown as Easeable).ease({ opacity: 255, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        for (const card of this.cards) this.rest(card);
    }

    /** Shows `openness` (0 closed, 1 open) of the way from the windows to the cards, following a gesture. */
    track(app: Shell.App | null, openness: number): void {
        if ((!this.root || this.closing) && app) this.open(app, true);
        const root = this.root;
        if (!root || this.closing) return;
        const backdrop = root.get_first_child();
        if (backdrop) {
            backdrop.remove_all_transitions();
            backdrop.opacity = Math.round(255 * openness);
        }
        const mix = (a: number, b: number) => a + (b - a) * openness;
        for (const card of this.cards) {
            const button = card.button;
            button.remove_all_transitions();
            const scale = card.slot.width / card.frameWidth;
            if (card.from) {
                button.set_position(mix(card.from.x, card.slot.x), mix(card.from.y, card.slot.y));
                button.set_scale(mix(1, scale), mix(1, scale));
            } else {
                button.opacity = Math.round(255 * openness);
            }
        }
    }

    /** Finishes what track() started: all the way open, or closed. */
    settle(open: boolean): void {
        const root = this.root;
        if (!root || this.closing) return;
        if (!open) {
            this.close(null);
            return;
        }
        const backdrop = root.get_first_child();
        if (backdrop) (backdrop as unknown as Easeable).ease({ opacity: 255, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        for (const card of this.cards) this.rest(card);
    }

    /** Closes, bringing `chosen` forward when given. */
    close(chosen: Meta.Window | null): void {
        const root = this.root;
        if (!root || this.closing) return;
        this.closing = true;
        this.releaseGrab();
        if (chosen) Main.activateWindow(chosen);
        if (this.title) this.title.opacity = 0;
        if (this.highlight) this.highlight.opacity = 0;
        const backdrop = root.get_first_child();
        if (backdrop) (backdrop as unknown as Easeable).ease({ opacity: 0, duration: CLOSE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        let pending = this.cards.length;
        const done = () => {
            pending--;
            if (pending <= 0 && this.root === root) this.finish();
        };
        if (pending === 0) done();
        for (const card of this.cards) {
            // A window that shows goes back to its place; the chosen one too, minimized or not.
            const target = card.window === chosen && !card.from ? this.frameOf(card.window) : card.from;
            const ease = card.button as unknown as Easeable;
            if (target) ease.ease({ x: target.x, y: target.y, scale_x: 1, scale_y: 1, duration: CLOSE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onStopped: done });
            else ease.ease({ opacity: 0, duration: CLOSE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onStopped: done });
        }
    }

    destroy(): void {
        this.finish();
    }

    private card(window: Meta.Window, slot: Rect, from: Rect | null, frameWidth: number): Card {
        const preview = new Clutter.Actor();
        const layout = new Shell.WindowPreviewLayout();
        preview.layout_manager = layout;
        layout.add_window(window);
        const button = new St.Button({ style_class: 'macr-expose-card', reactive: true, track_hover: true, can_focus: false, child: preview });
        button.set_pivot_point(0, 0);
        const card: Card = { window, button, slot, from, frameWidth };
        button.connect('clicked', () => this.close(window));
        button.connect('notify::hover', () => this.showTitle(card));
        this.root!.add_child(button);
        const start = from ?? slot;
        const scale = from ? 1 : slot.width / frameWidth;
        button.set_position(start.x, start.y);
        button.set_scale(scale, scale);
        if (!from) button.opacity = 0;
        return card;
    }

    private rest(card: Card): void {
        const scale = card.slot.width / card.frameWidth;
        (card.button as unknown as Easeable).ease({
            x: card.slot.x,
            y: card.slot.y,
            scale_x: scale,
            scale_y: scale,
            opacity: 255,
            duration: OPEN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    /** A ring around the card and the window's title under it, while the pointer is on it. */
    private showTitle(card: Card): void {
        const title = this.title;
        const highlight = this.highlight;
        if (!title || !highlight || this.closing) return;
        if (!card.button.hover) {
            title.opacity = 0;
            highlight.opacity = 0;
            return;
        }
        const ring = 4 * St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        highlight.set_position(Math.round(card.slot.x - ring), Math.round(card.slot.y - ring));
        highlight.set_size(Math.round(card.slot.width + 2 * ring), Math.round(card.slot.height + 2 * ring));
        highlight.opacity = 255;
        this.root?.set_child_above_sibling(highlight, null);
        title.text = card.window.get_title() ?? '';
        const [, width] = title.get_preferred_width(-1);
        title.set_position(Math.round(card.slot.x + (card.slot.width - width) / 2), Math.round(card.slot.y + card.slot.height + 8));
        title.opacity = 255;
        this.root?.set_child_above_sibling(title, null);
    }

    private frameOf(window: Meta.Window): Rect | null {
        const root = this.root;
        if (!root) return null;
        const frame = window.get_frame_rect();
        return { x: frame.x - root.x, y: frame.y - root.y, width: frame.width, height: frame.height };
    }

    private releaseGrab(): void {
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
    }

    private finish(): void {
        this.releaseGrab();
        this.root?.destroy();
        this.root = null;
        this.title = null;
        this.highlight = null;
        this.cards = [];
        this.app = null;
        this.closing = false;
    }
}
