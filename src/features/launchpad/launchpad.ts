import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { notifyLaunchpad } from '../../shared/launchpad-link.js';
import { FolderStore } from './folders.js';
import { filterApps } from './logic/filter.js';
import { type AppFacts, gridItems, parseCategories } from './logic/folders.js';
import { type Direction, type GridShape, gridShape, moveSelection, paginate } from './logic/grid.js';

interface AppEntry extends AppFacts {
    app: Shell.App;
    keywords: string[];
    executable: string;
}

type Item = { kind: 'app'; entry: AppEntry } | { kind: 'folder'; id: string; name: string; apps: AppEntry[] };

/** Where a pressed or dragged cell lives: the main grid or the open folder. */
type Source = 'grid' | 'folder';

interface Press {
    source: Source;
    index: number;
    cell: St.Widget;
    x: number;
    y: number;
}

interface Drag {
    source: Source;
    entry: AppEntry;
    cell: St.Widget;
    actor: Clutter.Actor;
    /** The grid cell under the icon, which it would join. */
    target: number;
}

interface OpenFolder {
    id: string;
    name: string;
    shade: St.Widget;
    panel: St.BoxLayout;
    title: St.Entry;
    cells: St.Widget[];
    apps: AppEntry[];
}

type DesktopInfo = Gio.AppInfo & { get_keywords?(): string[]; get_categories?(): string | null };

const OPEN_MS = 200;
const CLOSE_MS = 150;
const SLIDE_MS = 250;
const FOLDER_MS = 180;
/** Accumulated smooth-scroll distance that turns a page. */
const SCROLL_PAGE = 1.5;
/** One swipe turns one page. */
const PAGE_COOLDOWN_US = 350_000;
/** How far the pointer moves, in logical px, before a press becomes a drag. */
const DRAG_THRESHOLD = 8;
/** How long a dragged icon waits at the screen's side before the page turns. */
const EDGE_TURN_MS = 600;
/** The share of a cell, around its middle, that a dragged app drops onto. */
const DROP_ZONE = 0.6;
/** How much of an app icon its artwork fills: a folder is that big. */
const FOLDER_ART = 0.86;
/** Rows of apps an open folder shows before it scrolls. */
const FOLDER_ROWS = 3;

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
        if (!app || !id) continue;
        entries.push({
            id,
            app,
            name: app.get_name(),
            categories: parseCategories(info.get_categories?.() ?? null),
            keywords: info.get_keywords?.() ?? [],
            executable: info.get_executable() ?? '',
        });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function scaleFactor(): number {
    return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
}

/**
 * macOS Launchpad: every app in a paged grid over the blurred desktop of the
 * monitor under the pointer. Typing filters; arrows, Enter, Page Up/Down and
 * Esc work; scroll or swipe turns pages. Apps can be grouped in folders
 * (GNOME's own app folders): drag an app onto another to make one, onto a
 * folder to add it, out of an open folder to take it out. Built when it
 * opens, gone when it closes.
 */
export class Launchpad {
    private root: St.Widget | null = null;
    private grab: Clutter.Grab | null = null;
    private entry: St.Entry | null = null;
    private pages: St.BoxLayout | null = null;
    private dots: St.BoxLayout | null = null;
    private store: FolderStore | null = null;
    private pageWidth = 0;
    private pageHeight = 0;
    private cellWidth = 0;
    private cellHeight = 0;
    private iconSize = 96;
    private apps: AppEntry[] = [];
    private shown: Item[] = [];
    private cells: St.Widget[] = [];
    private shape: GridShape = { columns: 1, rows: 1, perPage: 1 };
    private page = 0;
    private selected = -1;
    private scrolled = 0;
    private lastTurn = 0;
    private closing = false;
    private folder: OpenFolder | null = null;
    private press: Press | null = null;
    private drag: Drag | null = null;
    private edgeTimeout = 0;
    private reloadId = 0;
    /** A folder just made by a drop, to open once the grid has it. */
    private made: string | null = null;

    get isOpen(): boolean {
        return this.root !== null && !this.closing;
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    /** Opens Launchpad; `tracked` leaves it unshown for track() to bring in. */
    open(tracked = false): void {
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

        const entry = new St.Entry({ style_class: 'macr-launchpad-search', hint_text: _('Search'), can_focus: true, x_align: Clutter.ActorAlign.CENTER });
        entry.set_primary_icon(new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'macr-launchpad-search-icon' }));
        column.add_child(entry);

        // The grid area is what the grid shape reserves: search above, dots below.
        const scale = scaleFactor();
        const logical = { width: monitor.width / scale, height: monitor.height / scale };
        this.shape = gridShape(logical.width, logical.height);
        this.pageWidth = monitor.width;
        this.pageHeight = monitor.height - (120 + 110) * scale;
        this.cellWidth = (this.pageWidth - 2 * 80 * scale) / this.shape.columns;
        this.cellHeight = this.pageHeight / this.shape.rows;
        this.iconSize = Math.min(96, Math.round(this.cellHeight / scale - 52));
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
        this.store = new FolderStore(() => this.queueReload());
        this.refilter();

        root.connect('captured-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onCaptured(event));
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
        if (!tracked) (root as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        notifyLaunchpad();
    }

    /** Shows Launchpad `openness` (0 closed, 1 open) of the way, following a gesture. */
    track(openness: number): void {
        if (!this.root || this.closing) this.open(true);
        const root = this.root;
        if (!root) return;
        root.remove_all_transitions();
        root.opacity = Math.round(255 * openness);
        const scale = 1.06 - 0.06 * openness;
        root.set_scale(scale, scale);
    }

    /** Finishes what track() started: all the way open, or closed. */
    settle(open: boolean): void {
        const root = this.root;
        if (!root || this.closing) return;
        if (!open) this.close();
        else (root as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    close(): void {
        const root = this.root;
        if (!root || this.closing) return;
        this.commitFolderName();
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
        this.stopEdgeTurn();
        if (this.reloadId) GLib.source_remove(this.reloadId);
        this.reloadId = 0;
        this.store?.destroy();
        this.store = null;
        this.press = null;
        this.drag = null;
        this.folder = null;
        this.made = null;
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

    private get query(): string {
        return (this.entry?.get_text() ?? '').trim();
    }

    /** What the grid shows: matches while searching (inside folders too), else folders and apps. */
    private items(): Item[] {
        if (this.query) return filterApps(this.apps, this.query).map((entry) => ({ kind: 'app', entry }));
        const store = this.store;
        if (!store) return this.apps.map((entry) => ({ kind: 'app', entry }));
        const byId = new Map(this.apps.map((entry) => [entry.id, entry]));
        const folders = store.defs();
        const names = new Map(folders.map((folder) => [folder.id, store.displayName(folder)]));
        return gridItems(folders, this.apps, (folder) => names.get(folder.id) ?? folder.name).map((item): Item => {
            if (item.kind === 'app') return { kind: 'app', entry: byId.get(item.id)! };
            return { kind: 'folder', id: item.id, name: names.get(item.id) ?? '', apps: item.apps.map((id) => byId.get(id)!) };
        });
    }

    private refilter(): void {
        this.closeFolder(false);
        this.shown = this.items();
        this.buildPages();
        this.page = 0;
        this.selected = this.query && this.shown.length ? 0 : -1;
        this.showPage(0, false);
        this.syncSelection();
    }

    /** The folders changed (here or in GNOME's app grid): rebuild, keeping the page and an open folder. */
    private queueReload(): void {
        if (this.reloadId) return;
        this.reloadId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.reloadId = 0;
            if (this.drag) {
                this.queueReload();
                return GLib.SOURCE_REMOVE;
            }
            this.reload();
            return GLib.SOURCE_REMOVE;
        });
    }

    private reload(): void {
        if (!this.root || this.query) return;
        this.shown = this.items();
        this.buildPages();
        this.showPage(this.page, false);
        this.selected = -1;
        this.syncSelection();
        const made = this.made;
        this.made = null;
        const fresh = made === null ? -1 : this.shown.findIndex((it) => it.kind === 'folder' && it.id === made);
        const freshItem = this.shown[fresh];
        if (freshItem?.kind === 'folder') {
            // Where it went in the grid, open and ready for a name, as on macOS.
            this.showPage(Math.floor(fresh / this.shape.perPage), false);
            this.openFolder(freshItem);
            this.editFolderName();
            return;
        }
        const open = this.folder;
        if (!open) return;
        const item = this.shown.find((it) => it.kind === 'folder' && it.id === open.id);
        if (item?.kind === 'folder') this.fillFolder(item);
        else this.closeFolder(true);
    }

    private buildPages(): void {
        const pages = this.pages;
        const dots = this.dots;
        if (!pages || !dots) return;
        pages.destroy_all_children();
        dots.destroy_all_children();
        this.cells = [];

        paginate(this.shown, this.shape.perPage).forEach((items, pageIndex, all) => {
            // Fixed-size cells: a short last page or search keeps the same grid.
            const layout = new Clutter.GridLayout();
            // St scales CSS lengths itself: the side margin in logical pixels.
            const page = new St.Widget({ layout_manager: layout, width: this.pageWidth, height: this.pageHeight, style: 'padding: 0 80px;' });
            items.forEach((item, index) => {
                const cell = this.itemCell(item);
                const at = pageIndex * this.shape.perPage + index;
                cell.connect('notify::hover', () => {
                    if (cell.hover && !this.drag) this.select(at);
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

    /** An app or folder: the icon over its name. Presses are handled by onCaptured(). */
    private itemCell(item: Item): St.Widget {
        const box = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        const icon = item.kind === 'app' ? item.entry.app.create_icon_texture(this.iconSize) : this.folderIcon(item.apps);
        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        const label = new St.Label({ text: item.kind === 'app' ? item.entry.name : item.name, style_class: 'macr-launchpad-label', x_align: Clutter.ActorAlign.CENTER });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(label);
        const cell = new St.Bin({ style_class: 'macr-launchpad-app', child: box, reactive: true, track_hover: true, width: this.cellWidth, height: this.cellHeight });
        cell.accessible_name = label.text;
        return cell;
    }

    /**
     * A folder looks like macOS's: a frosted square, as big as an app icon's
     * artwork (icon themes leave a margin around it), with up to nine of its apps.
     */
    private folderIcon(apps: AppEntry[]): St.Widget {
        const size = this.iconSize;
        const outer = Math.round(size * FOLDER_ART);
        const pad = Math.round(outer * 0.11);
        const gap = Math.round(outer * 0.05);
        // St sizes the content box: take off the padding and the 1px border.
        const content = outer - 2 * pad - 2;
        const mini = Math.floor((content - 2 * gap) / 3);
        const layout = new Clutter.GridLayout({ column_spacing: gap * scaleFactor(), row_spacing: gap * scaleFactor() });
        const well = new St.Widget({
            style_class: 'macr-launchpad-folder',
            layout_manager: layout,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `width: ${content}px; height: ${content}px; padding: ${pad}px; border-radius: ${Math.round(outer * 0.23)}px;`,
        });
        apps.slice(0, 9).forEach((entry, index) => layout.attach(entry.app.create_icon_texture(mini), index % 3, Math.floor(index / 3), 1, 1));
        // In an icon-sized box, so its name lines up with the apps' names.
        return new St.Bin({ child: well, style: `width: ${size}px; height: ${size}px;` });
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

    /** Opens the app, or the folder, at `index` in the grid. */
    private activate(index: number): void {
        const item = this.shown[index];
        if (!item) return;
        if (item.kind === 'folder') this.openFolder(item);
        else this.launch(item.entry);
    }

    private launch(entry: AppEntry): void {
        this.close();
        entry.app.activate();
    }

    // ---- Folders ----

    /** The folder's apps in a frosted panel over the grid, under its name, which can be edited. */
    private openFolder(item: Extract<Item, { kind: 'folder' }>): void {
        const root = this.root;
        if (!root) return;
        this.closeFolder(false);
        const shade = new St.Widget({ style_class: 'macr-launchpad-folder-shade', reactive: true, layout_manager: new Clutter.BinLayout(), width: root.width, height: root.height });
        // The grid behind goes soft, as on macOS.
        const blur = new St.Widget({ width: root.width, height: root.height });
        blur.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 30, brightness: 0.85 }));
        shade.add_child(blur);
        const panel = new St.BoxLayout({ vertical: true, style_class: 'macr-launchpad-folder-panel', reactive: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        const title = new St.Entry({ style_class: 'macr-launchpad-folder-title', text: item.name, can_focus: true, x_align: Clutter.ActorAlign.CENTER });
        title.clutter_text.connect('activate', () => {
            this.commitFolderName();
            if (this.entry) (global.stage as Clutter.Stage).set_key_focus(this.entry.clutter_text);
        });
        title.clutter_text.connect('key-focus-out', () => this.commitFolderName());
        panel.add_child(title);
        shade.add_child(panel);
        root.add_child(shade);
        this.folder = { id: item.id, name: item.name, shade, panel, title, cells: [], apps: [] };
        this.fillFolder(item);

        panel.set_pivot_point(0.5, 0.5);
        panel.set_scale(0.9, 0.9);
        shade.opacity = 0;
        (shade as unknown as Easeable).ease({ opacity: 255, duration: FOLDER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        (panel as unknown as Easeable).ease({ scale_x: 1, scale_y: 1, duration: FOLDER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    /** (Re)builds the open folder's grid of apps. */
    private fillFolder(item: Extract<Item, { kind: 'folder' }>): void {
        const open = this.folder;
        if (!open) return;
        for (const child of open.panel.get_children()) if (child !== open.title) child.destroy();
        const columns = Math.max(3, Math.min(this.shape.columns, item.apps.length));
        const rows = Math.ceil(item.apps.length / columns);
        const layout = new Clutter.GridLayout();
        const grid = new St.Viewport({ layout_manager: layout });
        open.apps = item.apps;
        open.cells = item.apps.map((entry, index) => {
            const cell = this.itemCell({ kind: 'app', entry });
            layout.attach(cell, index % columns, Math.floor(index / columns), 1, 1);
            return cell;
        });
        const scroll = new St.ScrollView({
            style_class: 'macr-launchpad-folder-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            width: columns * this.cellWidth,
            height: Math.min(rows, FOLDER_ROWS) * this.cellHeight,
        });
        scroll.set_child(grid);
        open.panel.add_child(scroll);
    }

    /** Puts the key focus in the open folder's name, all of it selected. */
    private editFolderName(): void {
        const title = this.folder?.title;
        if (!title) return;
        (global.stage as Clutter.Stage).set_key_focus(title.clutter_text);
        title.clutter_text.set_selection(0, -1);
    }

    /** Saves a name typed into the open folder's title. */
    private commitFolderName(): void {
        const open = this.folder;
        if (!open || !this.store) return;
        const name = open.title.get_text().trim();
        if (!name) {
            open.title.set_text(open.name);
            return;
        }
        if (name === open.name) return;
        open.name = name;
        this.store.rename(open.id, name);
    }

    private closeFolder(animate: boolean): void {
        const open = this.folder;
        if (!open) return;
        this.commitFolderName();
        this.folder = null;
        if (this.entry && this.root) (global.stage as Clutter.Stage).set_key_focus(this.entry.clutter_text);
        if (!animate) {
            open.shade.destroy();
            return;
        }
        (open.shade as unknown as Easeable).ease({ opacity: 0, duration: FOLDER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onStopped: () => open.shade.destroy() });
        (open.panel as unknown as Easeable).ease({ scale_x: 0.9, scale_y: 0.9, duration: FOLDER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    // ---- Pressing and dragging ----

    /** The cell at stage `x`, `y`: one of the open folder's, else one of the grid's. */
    private cellAt(x: number, y: number): Omit<Press, 'x' | 'y'> | null {
        const find = (cells: St.Widget[], source: Source) => {
            const index = cells.findIndex((cell) => cell.mapped && this.inside(cell, x, y));
            return index >= 0 ? { source, index, cell: cells[index] } : null;
        };
        if (this.folder) return this.inside(this.folder.panel, x, y) ? find(this.folder.cells, 'folder') : null;
        // Only this page's: the next one sits past the monitor's side, maybe on another monitor.
        const first = this.page * this.shape.perPage;
        const hit = find(this.cells.slice(first, first + this.shape.perPage), 'grid');
        return hit && { ...hit, index: hit.index + first };
    }

    /** Presses on cells: a click opens, a drag moves the app into or out of a folder. */
    private onCaptured(event: Clutter.Event): boolean {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY || this.press) return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            const hit = this.cellAt(x, y);
            if (!hit) return Clutter.EVENT_PROPAGATE;
            this.press = { ...hit, x, y };
            hit.cell.add_style_pseudo_class('active');
            return Clutter.EVENT_STOP;
        }
        const press = this.press;
        if (!press) return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.MOTION) {
            const [x, y] = event.get_coords();
            if (!this.drag && Math.hypot(x - press.x, y - press.y) > DRAG_THRESHOLD * scaleFactor()) this.startDrag(press);
            if (this.drag) this.moveDrag(x, y);
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this.press = null;
            press.cell.remove_style_pseudo_class('active');
            const [x, y] = event.get_coords();
            if (this.drag) {
                this.drop(x, y);
            } else if (this.inside(press.cell, x, y)) {
                if (press.source === 'folder') {
                    const entry = this.folder?.apps[press.index];
                    if (entry) this.launch(entry);
                } else {
                    this.activate(press.index);
                }
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    private startDrag(press: Press): void {
        const root = this.root;
        const entry = press.source === 'folder' ? this.folder?.apps[press.index] : this.appAt(press.index);
        // Folders stay where they are.
        if (!root || !entry) return;
        // While searching the grid is flat: nothing to drop into.
        if (this.query && press.source === 'grid') return;
        const actor = entry.app.create_icon_texture(this.iconSize);
        root.add_child(actor);
        actor.set_pivot_point(0.5, 0.5);
        (actor as unknown as Easeable).ease({ scale_x: 1.1, scale_y: 1.1, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        press.cell.opacity = 0;
        this.select(-1);
        this.drag = { source: press.source, entry, cell: press.cell, actor, target: -1 };
    }

    private appAt(index: number): AppEntry | null {
        const item = this.shown[index];
        return item?.kind === 'app' ? item.entry : null;
    }

    private moveDrag(x: number, y: number): void {
        const drag = this.drag;
        const root = this.root;
        if (!drag || !root) return;
        const size = this.iconSize * scaleFactor();
        drag.actor.set_position(x - root.x - size / 2, y - root.y - size / 2);
        if (drag.source === 'folder') {
            // Out of the panel: the app is leaving the folder.
            const leaving = !this.inside(this.folder?.panel ?? null, x, y);
            const panel = this.folder?.panel as unknown as Easeable | undefined;
            panel?.ease({ opacity: leaving ? 120 : 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            return;
        }
        this.setTarget(this.dropTarget(x, y));
        this.edgeTurn(x);
    }

    /** The grid cell on this page whose middle is under the pointer, other than the dragged one. */
    private dropTarget(x: number, y: number): number {
        const first = this.page * this.shape.perPage;
        for (let at = first; at < Math.min(first + this.shape.perPage, this.cells.length); at++) {
            const cell = this.cells[at];
            if (cell === this.drag?.cell) continue;
            const [cx, cy] = cell.get_transformed_position();
            const [width, height] = cell.get_transformed_size();
            const marginX = (width * (1 - DROP_ZONE)) / 2;
            const marginY = (height * (1 - DROP_ZONE)) / 2;
            if (x >= (cx ?? 0) + marginX && x < (cx ?? 0) + width - marginX && y >= (cy ?? 0) + marginY && y < (cy ?? 0) + height - marginY) return at;
        }
        return -1;
    }

    private setTarget(target: number): void {
        const drag = this.drag;
        if (!drag || drag.target === target) return;
        this.cells[drag.target]?.remove_style_pseudo_class('drop');
        drag.target = target;
        this.cells[target]?.add_style_pseudo_class('drop');
    }

    /** Holding a dragged app at the screen's side turns the page. */
    private edgeTurn(x: number): void {
        const root = this.root;
        if (!root) return;
        const edge = 60 * scaleFactor();
        const step = x < root.x + edge ? -1 : x > root.x + root.width - edge ? 1 : 0;
        if (!step) {
            this.stopEdgeTurn();
            return;
        }
        if (this.edgeTimeout) return;
        this.edgeTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, EDGE_TURN_MS, () => {
            this.edgeTimeout = 0;
            if (!this.drag) return GLib.SOURCE_REMOVE;
            this.showPage(this.page + step, true);
            this.setTarget(-1);
            // Keep turning while it stays there.
            const [px] = global.get_pointer();
            this.edgeTurn(px);
            return GLib.SOURCE_REMOVE;
        });
    }

    private stopEdgeTurn(): void {
        if (this.edgeTimeout) GLib.source_remove(this.edgeTimeout);
        this.edgeTimeout = 0;
    }

    private inside(actor: Clutter.Actor | null, x: number, y: number): boolean {
        if (!actor) return false;
        const [ax, ay] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        return x >= (ax ?? 0) && x < (ax ?? 0) + width && y >= (ay ?? 0) && y < (ay ?? 0) + height;
    }

    /** Drops the dragged app: onto an app makes a folder, onto a folder adds it, out of a folder takes it out. */
    private drop(x: number, y: number): void {
        const drag = this.drag;
        const store = this.store;
        if (!drag || !store) return;
        this.stopEdgeTurn();
        const target = drag.target;
        this.setTarget(-1);
        this.drag = null;
        const item = target >= 0 ? this.shown[target] : null;
        const open = this.folder;
        if (drag.source === 'folder' && open && !this.inside(open.panel, x, y)) {
            drag.actor.destroy();
            this.closeFolder(true);
            store.remove(open.id, drag.entry, this.apps);
            return;
        }
        if (drag.source === 'grid' && item) {
            drag.actor.destroy();
            if (item.kind === 'folder') store.add(item.id, drag.entry.id);
            else this.made = store.create([item.entry, drag.entry]);
            return;
        }
        // Nowhere to go: back to its place.
        (open?.panel as unknown as Easeable | undefined)?.ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        const [cx, cy] = drag.cell.get_transformed_position();
        const [width, height] = drag.cell.get_transformed_size();
        const root = this.root;
        const size = this.iconSize * scaleFactor();
        const home = { x: (cx ?? 0) + width / 2 - size / 2 - (root?.x ?? 0), y: (cy ?? 0) + height / 2 - size / 2 - (root?.y ?? 0) - 12 * scaleFactor() };
        (drag.actor as unknown as Easeable).ease({
            x: home.x,
            y: home.y,
            scale_x: 1,
            scale_y: 1,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                drag.actor.destroy();
                drag.cell.opacity = 255;
            },
        });
    }

    // ---- Input ----

    private onPress(event: Clutter.Event): boolean {
        const target = (global.stage as Clutter.Stage).get_event_actor(event);
        const inside = (actor: Clutter.Actor | null) => actor !== null && target !== null && actor.contains(target);
        // A click beside an open folder closes the folder only.
        if (this.folder) {
            if (!inside(this.folder.panel)) this.closeFolder(true);
            return inside(this.folder?.panel ?? null) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
        }
        // Clicks on apps, dots and the search field are theirs; anything else closes.
        if (this.cells.some(inside) || inside(this.entry) || inside(this.dots)) return Clutter.EVENT_PROPAGATE;
        this.close();
        return Clutter.EVENT_STOP;
    }

    private onScroll(event: Clutter.Event): boolean {
        if (this.folder) return Clutter.EVENT_STOP;
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
            if (this.drag) return Clutter.EVENT_STOP;
            if (this.folder) this.closeFolder(true);
            else if (this.entry?.get_text()) this.entry.set_text('');
            else this.close();
            return Clutter.EVENT_STOP;
        }
        // An open folder takes clicks; the keys beyond Esc wait until it closes.
        if (this.folder) return Clutter.EVENT_PROPAGATE;
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            this.activate(this.selected >= 0 ? this.selected : 0);
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
