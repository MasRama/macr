import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { expose } from '../../shared/expose-link.js';
import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { clickAction, nextWindow } from './logic/rules.js';

type Disconnectable = { disconnect(id: number): void };
type Connectable = Disconnectable & { connect(signal: string, callback: (...args: never[]) => unknown): number };
type SizedIcon = { setIconSize(size: number): void };
type Delegated = Clutter.Actor & { _delegate?: { icon?: SizedIcon; app?: Shell.App } };

/** The signals Dash._init connects on shell-wide objects and never disconnects. */
const LEAKED_SIGNALS = new Set([
    'installed-changed',
    'app-state-changed',
    'changed',
    'item-drag-begin',
    'item-drag-end',
    'item-drag-cancelled',
    'window-drag-begin',
    'window-drag-end',
    'window-drag-cancelled',
]);

/** Records the handlers connected on `targets` until stop() is called. */
function recordConnections(targets: Connectable[]): { stop(): [Disconnectable, number][] } {
    const recorded: [Disconnectable, number][] = [];
    const restore: (() => void)[] = [];
    for (const target of targets) {
        const own = Object.prototype.hasOwnProperty.call(target, 'connect');
        const original = target.connect;
        target.connect = (signal, callback) => {
            const id = original.call(target, signal, callback);
            if (LEAKED_SIGNALS.has(signal)) recorded.push([target, id]);
            return id;
        };
        restore.push(() => {
            if (own) target.connect = original;
            else delete (target as Partial<Connectable>).connect;
        });
    }
    return {
        stop() {
            for (const undo of restore) undo();
            return recorded;
        },
    };
}

/** Icon size of the running dock, for drag actors. */
let currentIconSize = 48;

/** Moves the label above the item's magnified icon, not its resting size. */
export function liftLabel(item: Dash.DashItemContainer): void {
    item.label?.add_style_class_name('macr-dock-label');
    const show = item.showLabel.bind(item);
    item.showLabel = () => {
        show();
        const child = item.child;
        if (item.label && child) item.label.y -= (child.scale_y - 1) * child.height;
    };
}

/** Windows of `app` that the dock click acts on: normal ones on the active workspace. */
function windowsHere(app: Shell.App): Meta.Window[] {
    const workspace = global.workspace_manager.get_active_workspace();
    return app
        .get_windows()
        .filter((window) => !window.skip_taskbar && window.located_on_workspace(workspace))
        .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
}

/** An app in the dock. Clicking the focused app minimizes or cycles its windows. */
export const MacrDashIcon = GObject.registerClass(
    class MacrDashIcon extends Dash.DashIcon {
        override activate(button: number): void {
            const event = Clutter.get_current_event();
            const ctrl = ((event?.get_state() ?? 0) & Clutter.ModifierType.CONTROL_MASK) !== 0;
            const windows = windowsHere(this.app);
            const action = Main.overview.visible
                ? 'default'
                : clickAction({
                      running: this.app.state === Shell.AppState.RUNNING,
                      focused: Shell.WindowTracker.get_default().focus_app === this.app,
                      windowsHere: windows.length,
                      newWindow: ctrl || button === Clutter.BUTTON_MIDDLE,
                  });
            if (action === 'minimize') {
                windows[0].minimize();
            } else if (action === 'cycle') {
                const next = nextWindow(windows, global.display.focus_window);
                if (next) Main.activateWindow(next);
            } else {
                super.activate(button);
            }
        }

        private get menu(): PopupMenu.PopupMenu | null {
            return (this as unknown as { _menu?: PopupMenu.PopupMenu | null })._menu ?? null;
        }

        // GNOME builds the app menu on the first right click: dress it like Macr's menus.
        override popupMenu(side?: St.Side): void {
            super.popupMenu(side);
            const menu = this.menu;
            if (!menu) return;
            styleMenu(menu);
            syncMenuScheme(menu);
            this.syncShowAll(menu);
        }

        /** Show All Windows (App Exposé), after the app's window list, while App Exposé runs. */
        private syncShowAll(menu: PopupMenu.PopupMenu): void {
            const self = this as unknown as { _macrShowAll?: PopupMenu.PopupMenuItem };
            if (!self._macrShowAll) {
                const item = new PopupMenu.PopupMenuItem(_('Show All Windows'));
                item.connect('activate', () => expose()?.show(this.app));
                const section = (menu as unknown as { _windowSection?: PopupMenu.PopupMenuSection })._windowSection;
                const items = (menu as unknown as { _getMenuItems(): unknown[] })._getMenuItems();
                const index = section ? items.indexOf(section) : -1;
                menu.addMenuItem(item, index >= 0 ? index + 1 : undefined);
                self._macrShowAll = item;
            }
            self._macrShowAll.visible = expose() !== null && windowsHere(this.app).length > 0;
        }

        // GNOME 46 leaves the menu in the stage when the icon goes, and the
        // dock rebuilds its icons on every enable.
        protected override _onDestroy(): void {
            super._onDestroy();
            this.menu?.destroy();
        }

        // The overview's own dash is hidden, so its icon size is not ours.
        override getDragActor(): St.Widget {
            return this.app.create_icon_texture(currentIconSize) as St.Widget;
        }
    },
);

/**
 * GNOME's Dash, reused for the dock: favourites, running apps, drag to
 * reorder and right-click menus. Its icon size comes from Macr's setting
 * instead of the space the overview gives it.
 */
export const MacrDash = GObject.registerClass(
    class MacrDash extends Dash.Dash {
        private leaked!: [Disconnectable, number][];
        private pixels!: number;
        /** Extra items (the Trash) that follow the icon size too. */
        extraItems!: Dash.DashItemContainer[];
        /** Recent apps shown after the running ones (see RecentApps). */
        recentApps!: () => Shell.App[];

        constructor(iconSize: number, extensionPath: string) {
            const targets = [
                Shell.AppSystem.get_default() as unknown as Connectable,
                AppFavorites.getAppFavorites() as unknown as Connectable,
                Main.overview as unknown as Connectable,
            ];
            const recorder = recordConnections(targets);
            try {
                super();
            } catch (error) {
                recorder.stop();
                throw error;
            }
            this.leaked = recorder.stop();
            this.pixels = iconSize;
            currentIconSize = iconSize;
            this.extraItems = [];
            this.recentApps = () => [];
            // Not #dash: the shell theme's overview dash styles stay off the dock.
            this.name = 'macrDash';
            this.useAppsIcon(extensionPath);
            // Magnified icons grow out of the dock.
            this._box.clip_to_allocation = false;
            liftLabel(this._showAppsIcon);
            this._showAppsIcon.child?.set_pivot_point(0.5, 1);
            this.connect('destroy', () => {
                for (const [target, id] of this.leaked) target.disconnect(id);
                this.leaked = [];
            });
        }

        /** Macr's colour app-grid icon (like macOS's Apps) instead of the symbolic one. */
        private useAppsIcon(extensionPath: string): void {
            const showApps = this._showAppsIcon as unknown as { icon: { createIcon: (size: number) => St.Icon; update(): void }; _iconActor: St.Icon | null };
            const gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(`${extensionPath}/icons/macr-apps.svg`) });
            showApps.icon.createIcon = (size: number) => {
                showApps._iconActor = new St.Icon({ gicon, icon_size: size, style_class: 'show-apps-icon', track_hover: true });
                return showApps._iconActor;
            };
            showApps.icon.update();
        }

        get iconPixels(): number {
            return this.pixels;
        }

        setIconPixels(size: number): void {
            this.pixels = size;
            currentIconSize = size;
            this._adjustIconSize();
            this._queueRedisplay();
        }

        override _createAppItem(app: Shell.App): Dash.DashItemContainer {
            const item = new Dash.DashItemContainer();
            const appIcon = new MacrDashIcon(app);
            appIcon.connect('menu-state-changed', (_icon: unknown, opened: boolean) => this._itemMenuStateChanged(item, opened));
            item.setChild(appIcon);
            appIcon.label_actor = null as unknown as Clutter.Actor;
            item.setLabelText(app.get_name());
            (appIcon.icon as unknown as SizedIcon).setIconSize(this.pixels);
            appIcon.set_pivot_point(0.5, 1);
            this._hookUpLabel(item, appIcon);
            liftLabel(item);
            return item;
        }

        // GNOME lists the favourites, then the running apps; the recent apps
        // join the running ones for that one pass, so they get the same
        // icons, separator and drag handling.
        override _redisplay(): void {
            // Dash._init may redisplay before the constructor below sets it.
            const recent = this.recentApps?.() ?? [];
            if (recent.length === 0) {
                super._redisplay();
                return;
            }
            const system = this._appSystem;
            this._appSystem = { get_running: () => [...system.get_running(), ...recent] } as unknown as Shell.AppSystem;
            try {
                super._redisplay();
            } finally {
                this._appSystem = system;
            }
        }

        override _adjustIconSize(): void {
            this.iconSize = this.pixels;
            const items = [
                ...this._box.get_children().filter((actor) => {
                    const item = actor as Dash.DashItemContainer;
                    return (item.child as Delegated | null)?._delegate?.icon && !item.animatingOut;
                }),
                this._showAppsIcon,
                ...this.extraItems,
            ] as Dash.DashItemContainer[];
            for (const item of items) {
                (item.child as Delegated | null)?._delegate?.icon?.setIconSize(this.pixels);
            }
            if (this._separator) this._separator.height = this.pixels;
        }

        /** Items in the order they are drawn, left to right. */
        rowItems(): Clutter.Actor[] {
            const box = this._box.get_children();
            return [this._showAppsIcon, ...box];
        }

        /** The icon actor of `app` in the dock, for the genie target. */
        iconOf(app: Shell.App): Clutter.Actor | null {
            for (const actor of this._box.get_children()) {
                const child = (actor as Dash.DashItemContainer).child as Delegated | null;
                if (child?._delegate?.app === app) return (child._delegate as unknown as { icon: { icon: Clutter.Actor } }).icon.icon;
            }
            return null;
        }
    },
);

export type MacrDash = InstanceType<typeof MacrDash>;
