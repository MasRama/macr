import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { notifyLaunchpad } from '../../shared/launchpad-link.js';
import { filterApps } from './logic/filter.js';
import { type Direction, type GridShape, gridShape, moveSelection, paginate } from './logic/grid.js';

interface AppEntry {
    app: Shell.App;
    name: string;
    keywords: string[];
    executable: string;
}

type DesktopInfo = Gio.AppInfo & { get_keywords?(): string[] };

const OPEN_MS = 200;
const CLOSE_MS = 150;
const SLIDE_MS = 250;
/** Accumulated smooth-scroll distance that turns a page. */
const SCROLL_PAGE = 1.5;
/** One swipe turns one page. */
const PAGE_COOLDOWN_US = 350_000;

const KEY_DIRECTIONS = new Map<number, Direction>([
    [Clutter.KEY_Left, 'left'],
    [Clutter.KEY_Right, 'right'],
    [Clutter.KEY_Up, 'up'],
    [Clutter.KEY_Down, 'down'],
]);

/** The installed apps a user can launch, by name. */
function installedApps(): AppEntry[] {
    const system = Shell.AppSystem.get_default();
    const entries: AppEntry[] = [];
    for (const info of system.get_installed() as DesktopInfo[]) {
        if (!info.should_show()) continue;
        const id = info.get_id();
        const app = id ? system.lookup_app(id) : null;
        if (!app) continue;
        entries.push({ app, name: app.get_name(), keywords: info.get_keywords?.() ?? [], executable: info.get_executable() ?? '' });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * macOS Launchpad: every app in a paged grid over the blurred desktop of the
 * monitor under the pointer. Typing filters; arrows, Enter, Page Up/Down and
 * Esc work; scroll or swipe turns pages. Built when it opens, gone when it
 * closes.
 */
export class Launchpad {
    private root: St.Widget | null = null;
    private grab: Clutter.Grab | null = null;
    private entry: St.Entry | null = null;
    private pages: St.BoxLayout | null = null;
    private dots: St.BoxLayout | null = null;
    private pageWidth = 0;
    private pageHeight = 0;
    private apps: AppEntry[] = [];
    private shown: AppEntry[] = [];
    private cells: St.Button[] = [];
    private shape: GridShape = { columns: 1, rows: 1, perPage: 1 };
    private page = 0;
    private selected = -1;
    private scrolled = 0;
    private lastTurn = 0;
    private closing = false;

    get isOpen(): boolean {
        return this.root !== null && !this.closing;
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    open(): void {
        if (this.root) this.finishClose();
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        if (Main.overview.visible) Main.overview.hide();

        const root = new St.Widget({ style_class: 'macr-launchpad', reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        const backdrop = new St.Widget({ style_class: 'macr-launchpad-backdrop', width: monitor.width, height: monitor.height });
        backdrop.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 60, brightness: 0.7 }));
        root.add_child(backdrop);

        const column = new St.BoxLayout({ vertical: true, width: monitor.width, height: monitor.height });
        root.add_child(column);

        const entry = new St.Entry({ style_class: 'macr-launchpad-search', hint_text: 'Search', can_focus: true, x_align: Clutter.ActorAlign.CENTER });
        entry.set_primary_icon(new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'macr-launchpad-search-icon' }));
        column.add_child(entry);

        // The grid area is what the grid shape reserves: search above, dots below.
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const logical = { width: monitor.width / scale, height: monitor.height / scale };
        this.shape = gridShape(logical.width, logical.height);
        this.pageWidth = monitor.width;
        this.pageHeight = monitor.height - (120 + 110) * scale;
        const viewport = new St.Widget({ clip_to_allocation: true, width: this.pageWidth, height: this.pageHeight, reactive: false });
        const pages = new St.BoxLayout();
        viewport.add_child(pages);
        column.add_child(viewport);

        const dots = new St.BoxLayout({ style_class: 'macr-launchpad-dots', x_align: Clutter.ActorAlign.CENTER, y_expand: true, y_align: Clutter.ActorAlign.START });
        column.add_child(dots);

        this.root = root;
        this.entry = entry;
        this.pages = pages;
        this.dots = dots;
        this.closing = false;
        this.apps = installedApps();
        this.refilter();

        root.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onPress(event));
        root.connect('scroll-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onScroll(event));
        root.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onKey(event));
        entry.clutter_text.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onKey(event));
        entry.clutter_text.connect('text-changed', () => this.refilter());

        Main.layoutManager.uiGroup.add_child(root);
        const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this.finishClose();
            return;
        }
        this.grab = grab;
        (global.stage as Clutter.Stage).set_key_focus(entry.clutter_text);

        root.set_pivot_point(0.5, 0.5);
        root.opacity = 0;
        root.set_scale(1.06, 1.06);
        (root as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        notifyLaunchpad();
    }

    close(): void {
        const root = this.root;
        if (!root || this.closing) return;
        this.closing = true;
        this.releaseGrab();
        notifyLaunchpad();
        (root as unknown as Easeable).ease({
            opacity: 0,
            scale_x: 1.04,
            scale_y: 1.04,
            duration: CLOSE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (this.root === root) this.finishClose();
            },
        });
    }

    destroy(): void {
        this.finishClose();
    }

    private releaseGrab(): void {
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
    }

    private finishClose(): void {
        this.releaseGrab();
        this.root?.destroy();
        this.root = null;
        this.entry = null;
        this.pages = null;
        this.dots = null;
        this.cells = [];
        this.shown = [];
        this.apps = [];
        const wasOpen = !this.closing;
        this.closing = false;
        if (wasOpen) notifyLaunchpad();
    }

    private refilter(): void {
        const query = this.entry?.get_text() ?? '';
        this.shown = filterApps(this.apps, query);
        this.buildPages();
        this.page = 0;
        this.selected = query.trim() && this.shown.length ? 0 : -1;
        this.showPage(0, false);
        this.syncSelection();
    }

    private buildPages(): void {
        const pages = this.pages;
        const dots = this.dots;
        if (!pages || !dots) return;
        pages.destroy_all_children();
        dots.destroy_all_children();
        this.cells = [];
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const sideMargin = 80 * scale;
        const cellWidth = (this.pageWidth - 2 * sideMargin) / this.shape.columns;
        const cellHeight = this.pageHeight / this.shape.rows;
        const iconSize = Math.min(96, Math.round(cellHeight / scale - 52));

        paginate(this.shown, this.shape.perPage).forEach((items, pageIndex, all) => {
            // Fixed-size cells: a short last page or search keeps the same grid.
            const layout = new Clutter.GridLayout();
            // St scales CSS lengths itself: the side margin in logical pixels.
            const page = new St.Widget({ layout_manager: layout, width: this.pageWidth, height: this.pageHeight, style: 'padding: 0 80px;' });
            items.forEach((entry, index) => {
                const cell = this.appCell(entry, iconSize, cellWidth, cellHeight);
                const at = pageIndex * this.shape.perPage + index;
                cell.connect('clicked', () => this.launch(at));
                cell.connect('notify::hover', () => {
                    if (cell.hover) this.select(at);
                });
                layout.attach(cell, index % this.shape.columns, Math.floor(index / this.shape.columns), 1, 1);
                this.cells.push(cell);
            });
            pages.add_child(page);
            if (all.length > 1) {
                const dot = new St.Button({ style_class: 'macr-launchpad-dot', can_focus: false });
                dot.connect('clicked', () => this.showPage(pageIndex, true));
                dots.add_child(dot);
            }
        });
    }

    private appCell(entry: AppEntry, iconSize: number, width: number, height: number): St.Button {
        const box = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        const icon = entry.app.create_icon_texture(iconSize);
        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        const label = new St.Label({ text: entry.name, style_class: 'macr-launchpad-label', x_align: Clutter.ActorAlign.CENTER });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(label);
        return new St.Button({ style_class: 'macr-launchpad-app', child: box, can_focus: false, width, height });
    }

    private showPage(index: number, animate: boolean): void {
        const pages = this.pages;
        if (!pages) return;
        const count = Math.max(1, pages.get_n_children());
        this.page = Math.max(0, Math.min(count - 1, index));
        const x = -this.page * this.pageWidth;
        if (animate) (pages as unknown as Easeable).ease({ translation_x: x, duration: SLIDE_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        else pages.translation_x = x;
        (this.dots?.get_children() as St.Widget[] | undefined)?.forEach((dot, at) => {
            if (at === this.page) dot.add_style_pseudo_class('checked');
            else dot.remove_style_pseudo_class('checked');
        });
    }

    private select(index: number): void {
        this.selected = index;
        this.syncSelection();
    }

    private syncSelection(): void {
        this.cells.forEach((cell, at) => {
            if (at === this.selected) cell.add_style_pseudo_class('selected');
            else cell.remove_style_pseudo_class('selected');
        });
    }

    private launch(index: number): void {
        const entry = this.shown[index];
        if (!entry) return;
        this.close();
        entry.app.activate();
    }

    private onPress(event: Clutter.Event): boolean {
        // Clicks on apps, dots and the search field are theirs; anything else closes.
        const target = (global.stage as Clutter.Stage).get_event_actor(event);
        const inside = (actor: Clutter.Actor | null) => actor !== null && target !== null && actor.contains(target);
        if (this.cells.some(inside) || inside(this.entry) || inside(this.dots)) return Clutter.EVENT_PROPAGATE;
        this.close();
        return Clutter.EVENT_STOP;
    }

    private onScroll(event: Clutter.Event): boolean {
        const now = GLib.get_monotonic_time();
        let step = 0;
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                step = -1;
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                step = 1;
                break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [dx, dy] = event.get_scroll_delta();
                this.scrolled += Math.abs(dx) > Math.abs(dy) ? dx : dy;
                if (Math.abs(this.scrolled) >= SCROLL_PAGE) step = Math.sign(this.scrolled);
                break;
            }
        }
        if (step && now - this.lastTurn > PAGE_COOLDOWN_US) {
            this.lastTurn = now;
            this.scrolled = 0;
            this.showPage(this.page + step, true);
        }
        if (now - this.lastTurn <= PAGE_COOLDOWN_US) this.scrolled = 0;
        return Clutter.EVENT_STOP;
    }

    private onKey(event: Clutter.Event): boolean {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape) {
            if (this.entry?.get_text()) this.entry.set_text('');
            else this.close();
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            this.launch(this.selected >= 0 ? this.selected : 0);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Page_Up || key === Clutter.KEY_Page_Down) {
            this.showPage(this.page + (key === Clutter.KEY_Page_Up ? -1 : 1), true);
            return Clutter.EVENT_STOP;
        }
        const direction = KEY_DIRECTIONS.get(key);
        if (!direction) return Clutter.EVENT_PROPAGATE;
        const next = moveSelection(this.selected, direction, this.shown.length, this.shape);
        this.select(next);
        const page = Math.floor(Math.max(0, next) / this.shape.perPage);
        if (page !== this.page) this.showPage(page, true);
        return Clutter.EVENT_STOP;
    }
}

type Easeable = {
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void;
};
