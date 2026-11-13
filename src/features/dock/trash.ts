import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { askToEmptyTrash } from '../../shared/empty-trash.js';
import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { menuSide } from './dash.js';

const TRASH_URI = 'trash:///';

function openTrash(): void {
    try {
        Gio.AppInfo.launch_default_for_uri(TRASH_URI, global.create_app_launch_context(0, -1));
    } catch (error) {
        logError(error as object, 'Macr: could not open the Trash');
    }
}

/** The Trash at the end of the dock: open it, or empty it from its menu. */
export const TrashItem = GObject.registerClass(
    class TrashItem extends Dash.DashItemContainer {
        private full!: boolean;
        private monitor!: Gio.FileMonitor | null;
        private menu!: PopupMenu.PopupMenu;
        private menuManager!: PopupMenu.PopupMenuManager;
        private button!: St.Button;
        icon!: IconGrid.BaseIcon;

        constructor() {
            super();
            this.full = false;
            this.button = new St.Button({
                style_class: 'show-apps macr-dock-trash',
                track_hover: true,
                can_focus: true,
                button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
            });
            this.icon = new IconGrid.BaseIcon(_('Trash'), {
                setSizeManually: true,
                showLabel: false,
                createIcon: (size: number) => new St.Icon({ icon_name: this.full ? 'user-trash-full' : 'user-trash', icon_size: size }),
            });
            this.icon.y_align = Clutter.ActorAlign.CENTER;
            this.button.set_child(this.icon);
            (this.button as unknown as { _delegate: unknown })._delegate = this;
            this.setChild(this.button);
            this.setLabelText(_('Trash'));

            this.menu = new PopupMenu.PopupMenu(this.button, 0.5, menuSide());
            styleMenu(this.menu);
            Main.uiGroup.add_child(this.menu.actor);
            this.menu.actor.hide();
            this.menuManager = new PopupMenu.PopupMenuManager(this.button, {});
            this.menuManager.addMenu(this.menu, -1);

            this.button.connect('clicked', (_button: St.Button, mouse: number) => {
                if (mouse === Clutter.BUTTON_SECONDARY) this.openMenu();
                else openTrash();
            });

            const file = Gio.File.new_for_uri(TRASH_URI);
            try {
                this.monitor = file.monitor_directory(Gio.FileMonitorFlags.NONE, null);
                this.monitor.connect('changed', () => this.refresh());
            } catch {
                this.monitor = null;
            }
            this.refresh();

            this.connect('destroy', () => {
                this.monitor?.cancel();
                this.monitor = null;
                this.menu.destroy();
            });
        }

        private openMenu(): void {
            syncMenuScheme(this.menu);
            this.menu.removeAll();
            const open = new PopupMenu.PopupMenuItem(_('Open'));
            open.connect('activate', () => openTrash());
            this.menu.addMenuItem(open);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const empty = new PopupMenu.PopupMenuItem(_('Empty Trash…'));
            empty.setSensitive(this.full);
            empty.connect('activate', () => askToEmptyTrash());
            this.menu.addMenuItem(empty);
            this.hideLabel();
            this.menu.open(true);
        }

        private refresh(): void {
            Gio.File.new_for_uri(TRASH_URI).query_info_async('trash::item-count', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (file, result) => {
                try {
                    const info = file!.query_info_finish(result);
                    const full = info.get_attribute_uint32('trash::item-count') > 0;
                    if (full === this.full) return;
                    this.full = full;
                    (this.icon as unknown as { update(): void }).update();
                } catch {
                    // The item was destroyed, or gvfs has no trash backend.
                }
            });
        }
    },
);

export type TrashItem = InstanceType<typeof TrashItem>;
