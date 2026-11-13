import Clutter from 'gi://Clutter';
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
import { isLight } from '../../shared/scheme.js';
import { chooseView, FAN_MAX, fanSlot, gridShape, type StackEntry, type StackMode, visibleEntries } from './logic/stack.js';

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

type Easeable = {
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void;
};

interface Item extends StackEntry {
    file: Gio.File;
    label: string;
    gicon: Gio.Icon | null;
}

/** The user's Downloads folder, or null when it is not set up. */
export function downloadsFolder(): Gio.File | null {
    const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
    if (!path || path === GLib.get_home_dir()) return null;
    const file = Gio.File.new_for_path(path);
    return file.query_exists(null) ? file : null;
}

function launch(file: Gio.File): void {
    try {
        Gio.AppInfo.launch_default_for_uri(file.get_uri(), global.create_app_launch_context(0, -1));
    } catch (error) {
        logError(error as object, 'Macr: could not open a Downloads item');
    }
}

/** Reads the folder's items, newest first, then calls `done`. */
function readItems(folder: Gio.File, done: (items: Item[]) => void): void {
    folder.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (_source, result) => {
        let enumerator: Gio.FileEnumerator;
        try {
            enumerator = folder.enumerate_children_finish(result);
        } catch (error) {
            logError(error as object, 'Macr: could not read the Downloads folder');
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
 * The Downloads stack after the dock's divider: a click fans the newest
 * downloads up out of the dock, or shows them all in a grid, as on macOS.
 */
export const StackItem = GObject.registerClass(
    {
        Signals: { 'open-changed': {} },
    },
    class StackItem extends Dash.DashItemContainer {
        private folder!: Gio.File | null;
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
        icon!: IconGrid.BaseIcon;

        constructor(settings: Gio.Settings) {
            super();
            this.settings = settings;
            this.folder = downloadsFolder();
            this.root = null;
            this.grab = null;
            this.closing = false;
            this.placeLater = null;
            this.button = new St.Button({
                style_class: 'show-apps macr-dock-stack',
                track_hover: true,
                can_focus: true,
                button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
            });
            this.icon = new IconGrid.BaseIcon(_('Downloads'), {
                setSizeManually: true,
                showLabel: false,
                createIcon: (size: number) => new St.Icon({ icon_name: 'folder-download', icon_size: size }),
            });
            this.icon.y_align = Clutter.ActorAlign.CENTER;
            this.button.set_child(this.icon);
            (this.button as unknown as { _delegate: unknown })._delegate = this;
            this.button.set_pivot_point(0.5, 1);
            this.setChild(this.button);
            this.setLabelText(_('Downloads'));

            this.menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.BOTTOM);
            styleMenu(this.menu);
            Main.uiGroup.add_child(this.menu.actor);
            this.menu.actor.hide();
            this.menuManager = new PopupMenu.PopupMenuManager(this.button, {});
            this.menuManager.addMenu(this.menu, -1);

            this.button.connect('clicked', (_button: St.Button, mouse: number) => {
                if (mouse === Clutter.BUTTON_SECONDARY) this.openMenu();
                else this.toggle();
            });
            this.settingsIds = [settings.connect('changed::dock-downloads', () => this.syncShown())];
            this.syncShown();

            this.connect('destroy', () => {
                for (const id of this.settingsIds) this.settings.disconnect(id);
                this.settingsIds = [];
                this.finishClose();
                this.menu.destroy();
            });
        }

        get isOpen(): boolean {
            return this.root !== null;
        }

        private syncShown(): void {
            this.visible = this.folder !== null && this.settings.get_boolean('dock-downloads');
            if (!this.visible) this.close();
        }

        private mode(): StackMode {
            const mode = this.settings.get_string('dock-downloads-view');
            return mode === 'fan' || mode === 'grid' ? mode : 'automatic';
        }

        private openMenu(): void {
            this.close();
            syncMenuScheme(this.menu);
            this.menu.removeAll();
            const open = new PopupMenu.PopupMenuItem(_('Open “Downloads”'));
            open.connect('activate', () => this.folder && launch(this.folder));
            this.menu.addMenuItem(open);
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
            const view = chooseView(items.length, this.mode());
            if (view === 'fan') this.buildFan(root, folder, items.slice(0, FAN_MAX), anchor, scale);
            else this.buildGrid(root, folder, items.slice(0, GRID_MAX), anchor, monitor.width, scale);

            root.connect('button-press-event', () => {
                this.close();
                return Clutter.EVENT_STOP;
            });
            root.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
                if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
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
            if (was) this.emit('open-changed');
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
                items.forEach((item, index) => add(this.fanRow(item.label, item.gicon, () => this.activateItem(item.file), icon), index));
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
        private fanRow(text: string, gicon: Gio.Icon | null, onClick: (() => void) | null, size: number, round = false): St.Widget {
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

        /** A frosted panel above the dock icon: the folder's name, Open in Files and a scrolling grid. */
        private buildGrid(root: St.Widget, folder: Gio.File, items: Item[], anchor: { x: number; y: number }, monitorWidth: number, scale: number): void {
            const shape = gridShape(items.length);
            const cell = GRID_CELL * scale;
            const panel = new St.BoxLayout({ style_class: 'macr-stack-grid', vertical: true, reactive: true });
            panel.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
            // Presses on the panel stay in it; anywhere else closes.
            panel.connect('button-press-event', () => Clutter.EVENT_STOP);

            const header = new St.BoxLayout({ style_class: 'macr-stack-grid-header' });
            header.add_child(new St.Label({ text: folder.get_basename() ?? _('Downloads'), style_class: 'macr-stack-grid-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
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
                const margin = 8 * scale;
                const x = Math.max(margin, Math.min(monitorWidth - width - margin, anchor.x - width / 2));
                panel.set_position(Math.round(x), Math.round(anchor.y - height - 4 * scale));
                panel.set_pivot_point(Math.min(1, Math.max(0, (anchor.x - x) / width)), 1);
                panel.set_scale(0.92, 0.92);
                (panel as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            };
        }
    },
);

export type StackItem = InstanceType<typeof StackItem>;
