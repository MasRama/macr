import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { quickLook } from '../../shared/quick-look.js';
import type { Rect } from '../../shared/logic/geometry.js';
import { isLight } from '../../shared/scheme.js';
import { dockEdge, menuSide } from './dash.js';
import { isSide, panelPlace } from './logic/edge.js';
import {
    chooseView,
    FAN_MAX,
    fanSlot,
    fitInside,
    folderIcon,
    gridShape,
    isNewArrival,
    isShownName,
    pileEntries,
    pileLayers,
    type SpecialFolder,
    type StackDisplay,
    type StackEntry,
    type StackMode,
    visibleEntries,
} from './logic/stack.js';

const ATTRIBUTES = 'standard::name,standard::display-name,standard::is-hidden,standard::icon,standard::type,time::created,time::modified,thumbnail::path';
/** The grid never lists more than this. */
const GRID_MAX = 120;
/** Logical pixels. */
const FAN_ICON = 52;
const FAN_STEP = 62;
const FAN_WIDTH = 380;
const GRID_ICON = 56;
const GRID_CELL = 104;
const OPEN_MS = 220;
const CLOSE_MS = 150;
/** Waits for a folder to settle before reading it again, in ms. */
const REREAD_MS = 400;

type Easeable = {
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void;
};

interface Item extends StackEntry {
    file: Gio.File;
    label: string;
    gicon: Gio.Icon | null;
    /** The picture's thumbnail, when gvfs has one. */
    thumbnail: string | null;
}

/** The user's Downloads folder, or null when it is not set up. */
export function downloadsFolder(): Gio.File | null {
    const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
    if (!path || path === GLib.get_home_dir()) return null;
    const file = Gio.File.new_for_path(path);
    return file.query_exists(null) ? file : null;
}

/** A folder the dock shows as a stack. */
export interface StackSource {
    folder: Gio.File | null;
    name: string;
    icon: string;
    /** The folder's path in `dock-stacks`; null for the Downloads stack (`dock-downloads`). */
    path: string | null;
}

const SPECIAL_DIRS: [SpecialFolder, GLib.UserDirectory][] = [
    ['desktop', GLib.UserDirectory.DIRECTORY_DESKTOP],
    ['documents', GLib.UserDirectory.DIRECTORY_DOCUMENTS],
    ['music', GLib.UserDirectory.DIRECTORY_MUSIC],
    ['pictures', GLib.UserDirectory.DIRECTORY_PICTURES],
    ['videos', GLib.UserDirectory.DIRECTORY_VIDEOS],
    ['templates', GLib.UserDirectory.DIRECTORY_TEMPLATES],
    ['public', GLib.UserDirectory.DIRECTORY_PUBLIC_SHARE],
    ['downloads', GLib.UserDirectory.DIRECTORY_DOWNLOAD],
];

/** The stacks in dock order: the folders added in settings, then Downloads. */
export function stackSources(settings: Gio.Settings): StackSource[] {
    const special: Partial<Record<SpecialFolder, string>> = {};
    for (const [kind, dir] of SPECIAL_DIRS) {
        const path = GLib.get_user_special_dir(dir);
        if (path) special[kind] = path;
    }
    const sources: StackSource[] = settings.get_strv('dock-stacks').map((path) => {
        const file = Gio.File.new_for_path(path);
        return {
            folder: file.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY ? file : null,
            name: GLib.filename_display_basename(path),
            icon: folderIcon(path, special, GLib.get_home_dir()),
            path,
        };
    });
    sources.push({ folder: downloadsFolder(), name: _('Downloads'), icon: 'folder-download', path: null });
    return sources;
}

/** A picture's size in pixels, or null when it cannot be read. */
function pictureSize(path: string): { width: number; height: number } | null {
    try {
        const [format, width, height] = GdkPixbuf.Pixbuf.get_file_info(path);
        return format ? { width, height } : null;
    } catch {
        return null;
    }
}

function launch(file: Gio.File): void {
    try {
        Gio.AppInfo.launch_default_for_uri(file.get_uri(), global.create_app_launch_context(0, -1));
    } catch (error) {
        logError(error as object, 'Macr: could not open a stack item');
    }
}

/** Reads the folder's items, newest first, then calls `done`. */
function readItems(folder: Gio.File, done: (items: Item[]) => void): void {
    folder.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (_source, result) => {
        let enumerator: Gio.FileEnumerator;
        try {
            enumerator = folder.enumerate_children_finish(result);
        } catch (error) {
            logError(error as object, 'Macr: could not read a stack’s folder');
            done([]);
            return;
        }
        const items: Item[] = [];
        const next = () =>
            enumerator.next_files_async(200, GLib.PRIORITY_DEFAULT, null, (_e, res) => {
                let infos: Gio.FileInfo[];
                try {
                    infos = enumerator.next_files_finish(res);
                } catch {
                    infos = [];
                }
                for (const info of infos) {
                    const thumbnail = info.get_attribute_byte_string('thumbnail::path');
                    items.push({
                        name: info.get_name(),
                        label: info.get_display_name(),
                        hidden: info.get_is_hidden(),
                        created: info.has_attribute('time::created') ? info.get_attribute_uint64('time::created') : null,
                        modified: info.get_attribute_uint64('time::modified'),
                        file: folder.get_child(info.get_name()),
                        gicon: thumbnail ? new Gio.FileIcon({ file: Gio.File.new_for_path(thumbnail) }) : info.get_icon(),
                        thumbnail,
                    });
                }
                if (infos.length > 0) next();
                else {
                    enumerator.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    done(visibleEntries(items));
                }
            });
        next();
    });
}

/**
 * A folder stack after the dock's divider (Downloads, and any folder added
 * in settings): a click fans the newest items up out of the dock, or shows
 * them all in a grid, as on macOS.
 */
export const StackItem = GObject.registerClass(
    {
        Signals: { 'open-changed': {} },
    },
    class StackItem extends Dash.DashItemContainer {
        private folder!: Gio.File | null;
        private source!: StackSource;
        private button!: St.Button;
        private menu!: PopupMenu.PopupMenu;
        private menuManager!: PopupMenu.PopupMenuManager;
        private settings!: Gio.Settings;
        private settingsIds!: number[];
        private root!: St.Widget | null;
        private grab!: Clutter.Grab | null;
        private closing!: boolean;
        /** Places what needs measuring once the stack is on the stage. */
        private placeLater!: (() => void) | null;
        /** The items on show, and the one under the pointer (Space previews it). */
        private shown!: Item[];
        private pointed!: number;
        private fanned!: boolean;
        /** The folder's items, newest first, as last read; and the newest (undefined before the first read). */
        private latest!: Item[];
        private newest!: StackEntry | null | undefined;
        private readCount!: number;
        private monitor!: Gio.FileMonitor | null;
        private rereadId!: number;
        private alive!: boolean;
        /** What the dock icon shows: the pile of newest items, or the folder's icon. */
        private pile!: St.Widget | null;
        private pileSize!: number;
        icon!: IconGrid.BaseIcon;

        constructor(settings: Gio.Settings, source: StackSource) {
            super();
            this.settings = settings;
            this.source = source;
            this.folder = source.folder;
            this.root = null;
            this.grab = null;
            this.closing = false;
            this.placeLater = null;
            this.shown = [];
            this.pointed = -1;
            this.fanned = false;
            this.latest = [];
            this.newest = undefined;
            this.readCount = 0;
            this.monitor = null;
            this.rereadId = 0;
            this.alive = true;
            this.pile = null;
            this.pileSize = 0;
            this.button = new St.Button({
                style_class: 'show-apps macr-dock-stack',
                track_hover: true,
                can_focus: true,
                button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
            });
            this.icon = new IconGrid.BaseIcon(source.name, {
                setSizeManually: true,
                showLabel: false,
                createIcon: (size: number) => this.makePile(size),
            });
            this.icon.y_align = Clutter.ActorAlign.CENTER;
            this.button.set_child(this.icon);
            (this.button as unknown as { _delegate: unknown })._delegate = this;
            this.setChild(this.button);
            this.setLabelText(source.name);

            this.menu = new PopupMenu.PopupMenu(this.button, 0.5, menuSide());
            styleMenu(this.menu);
            Main.uiGroup.add_child(this.menu.actor);
            this.menu.actor.hide();
            this.menuManager = new PopupMenu.PopupMenuManager(this.button, {});
            this.menuManager.addMenu(this.menu, -1);

            this.button.connect('clicked', (_button: St.Button, mouse: number) => {
                if (mouse === Clutter.BUTTON_SECONDARY) this.openMenu();
                else this.toggle();
            });
            this.settingsIds = [
                settings.connect('changed::dock-downloads', () => this.syncShown()),
                settings.connect('changed::dock-stacks-display', () => this.fillPile()),
            ];
            this.syncShown();
            this.watchFolder();
            this.reread();

            this.connect('destroy', () => {
                this.alive = false;
                for (const id of this.settingsIds) this.settings.disconnect(id);
                this.settingsIds = [];
                this.monitor?.cancel();
                this.monitor = null;
                if (this.rereadId) GLib.Source.remove(this.rereadId);
                this.rereadId = 0;
                this.finishClose();
                this.menu.destroy();
            });
        }

        get isOpen(): boolean {
            return this.root !== null;
        }

        private syncShown(): void {
            this.visible = this.folder !== null && (this.source.path !== null || this.settings.get_boolean('dock-downloads'));
            if (!this.visible) this.close();
        }

        private display(): StackDisplay {
            return this.settings.get_string('dock-stacks-display') === 'folder' ? 'folder' : 'stack';
        }

        /** Reads the folder again a moment after it changes: a new download, a file deleted. */
        private watchFolder(): void {
            if (!this.folder) return;
            try {
                this.monitor = this.folder.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            } catch (error) {
                logError(error as object, 'Macr: could not watch a stack’s folder');
                return;
            }
            this.monitor.connect('changed', (_monitor: Gio.FileMonitor, file: Gio.File, other: Gio.File | null, event: Gio.FileMonitorEvent) => {
                // A download being written changes all the time; what shows only
                // changes when a shown file comes, goes, is renamed or finished.
                if (event === Gio.FileMonitorEvent.CHANGED || event === Gio.FileMonitorEvent.ATTRIBUTE_CHANGED) return;
                const shown = (f: Gio.File | null) => f !== null && isShownName(f.get_basename() ?? '');
                if (!shown(file) && !shown(other)) return;
                if (this.rereadId) return;
                this.rereadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REREAD_MS, () => {
                    this.rereadId = 0;
                    this.reread();
                    return GLib.SOURCE_REMOVE;
                });
            });
        }

        private reread(): void {
            if (!this.folder) return;
            const count = ++this.readCount;
            readItems(this.folder, (items) => {
                // Destroyed meanwhile, or a later read already landed.
                if (!this.alive || count !== this.readCount) return;
                const before = this.newest;
                this.latest = items;
                this.newest = items[0] ?? null;
                this.fillPile();
                if (this.source.path === null && isNewArrival(before, this.newest)) this.arrived();
            });
        }

        /** A new download landed. */
        private arrived(): void {}

        /** The dock icon's content, `size` logical pixels square. */
        private makePile(size: number): St.Widget {
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            const pile = new St.Widget({ style_class: 'macr-stack-pile', width: size * scale, height: size * scale });
            this.pile = pile;
            this.pileSize = size;
            pile.connect('destroy', () => {
                if (this.pile === pile) this.pile = null;
            });
            this.fillPile();
            return pile;
        }

        /** The newest items piled up, newest on top, or the folder's icon when there are none or Folder is chosen. */
        private fillPile(): void {
            const pile = this.pile;
            if (!pile) return;
            pile.destroy_all_children();
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            const size = this.pileSize;
            const items = this.display() === 'stack' ? pileEntries(this.latest) : [];
            if (items.length === 0) {
                pile.add_child(new St.Icon({ icon_name: this.source.icon, fallback_icon_name: 'folder', icon_size: size }));
                return;
            }
            const layers = pileLayers(items.length);
            layers.forEach((layer, index) => {
                // Bottom to top: the oldest of the pile first.
                const item = items[items.length - 1 - index];
                const box = size * layer.size;
                const picture = item.thumbnail ? pictureSize(item.thumbnail) : null;
                let layerActor: St.Widget;
                let width = box;
                let height = box;
                if (picture && item.thumbnail) {
                    // A picture keeps its shape, in a thin white frame, as on macOS.
                    ({ width, height } = fitInside(picture.width, picture.height, box));
                    layerActor = new St.Widget({ style_class: 'macr-stack-pile-picture', width: Math.round(width * scale), height: Math.round(height * scale) });
                    layerActor.set_style(`background-image: url("${GLib.filename_to_uri(item.thumbnail, null)}");`);
                } else {
                    layerActor = new St.Icon({ gicon: item.gicon ?? undefined, icon_size: Math.round(box), fallback_icon_name: 'text-x-generic' });
                }
                layerActor.set_position(Math.round((size / 2 + layer.x * size - width / 2) * scale), Math.round((size / 2 + layer.y * size - height / 2) * scale));
                layerActor.set_pivot_point(0.5, 0.5);
                layerActor.rotation_angle_z = layer.rotation;
                pile.add_child(layerActor);
            });
        }

        private mode(): StackMode {
            const mode = this.settings.get_string('dock-downloads-view');
            return mode === 'fan' || mode === 'grid' ? mode : 'automatic';
        }

        private openMenu(): void {
            this.close();
            syncMenuScheme(this.menu);
            this.menu.removeAll();
            const open = new PopupMenu.PopupMenuItem(_('Open “%s”').format(this.source.name));
            open.connect('activate', () => this.folder && launch(this.folder));
            this.menu.addMenuItem(open);
            const path = this.source.path;
            if (path !== null) {
                const remove = new PopupMenu.PopupMenuItem(_('Remove from Dock'));
                remove.connect('activate', () => this.settings.set_strv('dock-stacks', this.settings.get_strv('dock-stacks').filter((p) => p !== path)));
                this.menu.addMenuItem(remove);
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Display as')));
            const displays: [StackDisplay, string][] = [
                ['stack', _('Stack')],
                ['folder', _('Folder')],
            ];
            for (const [display, label] of displays) {
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => this.settings.set_string('dock-stacks-display', display));
                this.menu.addMenuItem(item);
                item.setOrnament(this.display() === display ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('View as')));
            const views: [StackMode, string][] = [
                ['automatic', _('Automatic')],
                ['fan', _('Fan')],
                ['grid', _('Grid')],
            ];
            for (const [mode, label] of views) {
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => this.settings.set_string('dock-downloads-view', mode));
                this.menu.addMenuItem(item);
                item.setOrnament(this.mode() === mode ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                // The fan only rises from a dock along the bottom, as on macOS.
                if (mode === 'fan' && isSide(dockEdge())) item.setSensitive(false);
            }
            this.hideLabel();
            this.menu.open(true);
        }

        private toggle(): void {
            if (this.root) this.close();
            else if (this.folder) {
                const folder = this.folder;
                readItems(folder, (items) => {
                    if (!this.root && this.get_stage()) this.open(folder, items);
                });
            }
        }

        private open(folder: Gio.File, items: Item[]): void {
            const monitor = Main.layoutManager.findMonitorForActor(this.button);
            if (!monitor) return;
            this.hideLabel();
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            const root = new St.Widget({ style_class: 'macr-stack', reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
            if (isLight()) root.add_style_class_name('macr-light');
            // Where the icon rests: the dock may be slid away (it comes back while
            // the stack is open) and the icon shifted by magnification.
            let [bx, by] = this.button.get_transformed_position();
            for (let actor: Clutter.Actor | null = this.button; actor; actor = actor.get_parent()) {
                bx = (bx ?? 0) - actor.translation_x;
                by = (by ?? 0) - actor.translation_y;
            }
            const anchor = { x: (bx ?? 0) - monitor.x + this.button.width / 2, y: (by ?? 0) - monitor.y - 6 * scale };
            const icon = { x: (bx ?? 0) - monitor.x, y: (by ?? 0) - monitor.y, width: this.button.width, height: this.button.height };
            // Down a side the stack always opens as a grid beside it.
            const view = isSide(dockEdge()) ? 'grid' : chooseView(items.length, this.mode());
            this.shown = items.slice(0, view === 'fan' ? FAN_MAX : GRID_MAX);
            this.pointed = -1;
            this.fanned = view === 'fan';
            if (view === 'fan') this.buildFan(root, folder, this.shown, anchor, scale);
            else this.buildGrid(root, folder, this.shown, icon, { width: monitor.width, height: monitor.height }, scale);

            root.connect('button-press-event', () => {
                this.close();
                return Clutter.EVENT_STOP;
            });
            root.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
                const key = event.get_key_symbol();
                if (key === Clutter.KEY_space) {
                    this.lookAt(this.pointed);
                    return Clutter.EVENT_STOP;
                }
                if (key !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
                this.close();
                return Clutter.EVENT_STOP;
            });
            Main.layoutManager.uiGroup.add_child(root);
            this.placeLater?.();
            this.placeLater = null;
            const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
            if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
                Main.popModal(grab);
                root.destroy();
                return;
            }
            this.root = root;
            this.grab = grab;
            this.closing = false;
            this.emit('open-changed');
        }

        close(): void {
            const root = this.root;
            if (!root || this.closing) return;
            this.closing = true;
            this.releaseGrab();
            (root as unknown as Easeable).ease({
                opacity: 0,
                duration: CLOSE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    if (this.root === root) this.finishClose();
                },
            });
        }

        private releaseGrab(): void {
            if (this.grab) Main.popModal(this.grab);
            this.grab = null;
        }

        private finishClose(): void {
            this.releaseGrab();
            const was = this.root !== null;
            this.root?.destroy();
            this.root = null;
            this.closing = false;
            this.shown = [];
            this.pointed = -1;
            if (was) this.emit('open-changed');
        }

        /**
         * Quick Look on an item. The stack closes first: the previewer is a
         * window, under the stack's overlay while it stays.
         */
        private lookAt(index: number): void {
            if (index < 0 || index >= this.shown.length) return;
            const uris = this.shown.map((item) => item.file.get_uri());
            this.close();
            // The fan rises from the dock, newest at the bottom: Down in the
            // previewer goes down the fan, towards the dock.
            if (this.fanned) quickLook(uris.reverse(), uris.length - 1 - index);
            else quickLook(uris, index);
        }

        /** Remembers the item under the pointer. */
        private trackPointer(button: St.Button, index: number): void {
            button.connect('notify::hover', () => {
                if (button.hover) this.pointed = index;
                else if (this.pointed === index) this.pointed = -1;
            });
        }

        private activateItem(file: Gio.File): void {
            launch(file);
            this.close();
        }

        /** Icons rising from the dock along a curve, names on their left, Open in Files on top. */
        private buildFan(root: St.Widget, folder: Gio.File, items: Item[], anchor: { x: number; y: number }, scale: number): void {
            const width = FAN_WIDTH * scale;
            const icon = FAN_ICON * scale;
            const step = FAN_STEP * scale;
            const rows: [St.Widget, { x: number; y: number; rotation: number }][] = [];
            const add = (child: St.Widget, index: number) => {
                const slot = fanSlot(index, step);
                child.set_size(width, icon);
                child.set_pivot_point(1 - icon / 2 / width, 0.5);
                child.set_position(anchor.x - width + icon / 2, anchor.y - icon / 2);
                child.opacity = 0;
                child.set_scale(0.6, 0.6);
                root.add_child(child);
                rows.push([child, slot]);
            };
            if (items.length === 0) {
                add(this.fanRow(_('No items'), null, null, icon), 0);
            } else {
                items.forEach((item, index) => {
                    const row = this.fanRow(item.label, item.gicon, () => this.activateItem(item.file), icon);
                    this.trackPointer(row, index);
                    add(row, index);
                });
            }
            const openRow = this.fanRow(_('Open in Files'), new Gio.ThemedIcon({ name: 'go-next-symbolic' }), () => this.activateItem(folder), icon, true);
            add(openRow, Math.max(1, items.length));
            rows.forEach(([child, slot], index) => {
                (child as unknown as Easeable).ease({
                    translation_x: slot.x,
                    translation_y: slot.y,
                    rotation_angle_z: slot.rotation,
                    opacity: 255,
                    scale_x: 1,
                    scale_y: 1,
                    delay: index * 12,
                    duration: OPEN_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            });
        }

        /** One fan row: the name in a pill, then the icon, right-aligned. */
        private fanRow(text: string, gicon: Gio.Icon | null, onClick: (() => void) | null, size: number, round = false): St.Button {
            const box = new St.BoxLayout({ style_class: 'macr-stack-fan-row', x_align: Clutter.ActorAlign.END, x_expand: true });
            const label = new St.Label({ text, style_class: 'macr-stack-name', y_align: Clutter.ActorAlign.CENTER });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
            box.add_child(label);
            if (gicon) {
                const iconBin = new St.Bin({ style_class: round ? 'macr-stack-open' : 'macr-stack-icon', width: size, height: size });
                iconBin.set_child(new St.Icon({ gicon, icon_size: round ? Math.round(size * 0.45) : size, fallback_icon_name: 'text-x-generic' }));
                box.add_child(iconBin);
            } else {
                box.add_child(new St.Widget({ width: size, height: size }));
            }
            const button = new St.Button({ style_class: 'macr-stack-fan-item', reactive: onClick !== null, can_focus: onClick !== null, track_hover: true, child: box });
            if (onClick) button.connect('clicked', onClick);
            return button;
        }

        /** A frosted panel above (or beside) the dock icon: the folder's name, Open in Files and a scrolling grid. */
        private buildGrid(root: St.Widget, folder: Gio.File, items: Item[], icon: Rect, monitor: { width: number; height: number }, scale: number): void {
            const shape = gridShape(items.length);
            const cell = GRID_CELL * scale;
            const panel = new St.BoxLayout({ style_class: 'macr-stack-grid', vertical: true, reactive: true });
            panel.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
            // Presses on the panel stay in it; anywhere else closes.
            panel.connect('button-press-event', () => Clutter.EVENT_STOP);

            const header = new St.BoxLayout({ style_class: 'macr-stack-grid-header' });
            header.add_child(new St.Label({ text: this.source.name, style_class: 'macr-stack-grid-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
            const openButton = new St.Button({ style_class: 'macr-stack-grid-open', label: _('Open in Files'), can_focus: true });
            openButton.connect('clicked', () => this.activateItem(folder));
            header.add_child(openButton);
            panel.add_child(header);

            const layout = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL });
            const grid = new St.Viewport({ layout_manager: layout, style_class: 'macr-stack-grid-items' });
            if (items.length === 0) grid.add_child(new St.Label({ text: _('No items'), style_class: 'macr-stack-empty' }));
            items.forEach((item, index) => {
                const cellBox = new St.BoxLayout({ vertical: true, x_expand: true });
                const iconBin = new St.Bin({ style_class: 'macr-stack-icon', x_align: Clutter.ActorAlign.CENTER });
                iconBin.set_child(new St.Icon({ gicon: item.gicon ?? undefined, icon_size: GRID_ICON * scale, fallback_icon_name: 'text-x-generic' }));
                cellBox.add_child(iconBin);
                const label = new St.Label({ text: item.label, style_class: 'macr-stack-grid-name', x_align: Clutter.ActorAlign.CENTER });
                label.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
                cellBox.add_child(label);
                const button = new St.Button({ style_class: 'macr-stack-grid-item', can_focus: true, track_hover: true, child: cellBox, width: cell, height: cell });
                button.connect('clicked', () => this.activateItem(item.file));
                this.trackPointer(button, index);
                layout.attach(button, index % shape.columns, Math.floor(index / shape.columns), 1, 1);
            });
            const scroll = new St.ScrollView({ style_class: 'macr-stack-grid-scroll', hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC, overlay_scrollbars: true });
            scroll.set_child(grid);
            scroll.set_size(shape.columns * cell + 8 * scale, shape.rows * cell);
            panel.add_child(scroll);
            root.add_child(panel);
            panel.opacity = 0;
            // Measured once on the stage, where its style (padding, border) applies.
            this.placeLater = () => {
                const [, width] = panel.get_preferred_width(-1);
                const [, height] = panel.get_preferred_height(width);
                const place = panelPlace(dockEdge(), icon, { width, height }, monitor, 10 * scale, 8 * scale);
                panel.set_position(Math.round(place.x), Math.round(place.y));
                panel.set_pivot_point(...place.pivot);
                panel.set_scale(0.92, 0.92);
                (panel as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            };
        }
    },
);

export type StackItem = InstanceType<typeof StackItem>;
