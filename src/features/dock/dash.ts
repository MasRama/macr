import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { adjustAnimationTime } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { expose } from '../../shared/expose-link.js';
import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { launcherEntries } from './launcher.js';
import { BOUNCE_HEIGHT, BOUNCE_TIME, type BounceKind, bounceOffset, bounceShift, keepBouncing } from './logic/bounce.js';
import { type DockEdge, growPivot, isSide, labelPlace } from './logic/edge.js';
import { badgeText, progressOf } from './logic/launcher.js';
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
/** The screen edge the docks sit on; they are built again when it changes. */
let currentEdge: DockEdge = 'bottom';

/** Whether icons bounce while their app opens and when it asks for attention. */
let bounceOn = true;

export function setBounce(on: boolean): void {
    bounceOn = on;
}

export function dockEdge(): DockEdge {
    return currentEdge;
}

/** The side of a dock item its menus open from, away from the screen edge. */
export function menuSide(): St.Side {
    if (currentEdge === 'left') return St.Side.LEFT;
    if (currentEdge === 'right') return St.Side.RIGHT;
    return St.Side.BOTTOM;
}

/** Makes `actor` grow away from the screen edge when magnified. */
export function growAway(actor: Clutter.Actor): void {
    const [x, y] = growPivot(currentEdge);
    actor.set_pivot_point(x, y);
}

/** Puts the label past the item's magnified icon, over it or beside it, not at its resting size. */
export function liftLabel(item: Dash.DashItemContainer): void {
    item.label?.add_style_class_name('macr-dock-label');
    const show = item.showLabel.bind(item);
    item.showLabel = () => {
        show();
        const { label, child } = item;
        if (!label || !child) return;
        const [x, y] = item.get_transformed_position();
        const grown = isSide(currentEdge) ? (child.scale_x - 1) * child.width : (child.scale_y - 1) * child.height;
        const gap = label.get_theme_node().get_length('-y-offset');
        const rect = { x: x ?? 0, y: y ?? 0, width: item.width, height: item.height };
        const stage = { width: global.stage.width, height: global.stage.height };
        const place = labelPlace(currentEdge, rect, grown, { width: label.width, height: label.height }, gap, stage);
        label.set_position(place.x, place.y);
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
        private badge!: St.Label;
        private progress!: St.Widget;
        private progressFill!: St.Widget;
        private launcherId = 0;
        private stateId = 0;
        private bouncing: { timeline: Clutter.Timeline; kind: BounceKind; done: number; started: number } | null = null;

        constructor(app: Shell.App) {
            super(app);
            // The count and progress the app sends (Unity launcher API), as on macOS.
            const container = (this as unknown as { _iconContainer: St.Widget })._iconContainer;
            this.badge = new St.Label({
                style_class: 'macr-dock-badge',
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
                visible: false,
            });
            this.progressFill = new St.Widget({ style_class: 'macr-dock-progress-fill', x_expand: true, y_expand: true });
            this.progressFill.set_pivot_point(0, 0.5);
            this.progress = new St.Widget({
                style_class: 'macr-dock-progress',
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.END,
                visible: false,
            });
            // Over the icon's top right corner, a little past it.
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            this.badge.translation_x = 5 * scale;
            this.badge.translation_y = -3 * scale;
            this.progress.add_child(this.progressFill);
            container.add_child(this.progress);
            container.add_child(this.badge);
            // The running dot sits between the icon and the screen edge.
            const dot = (this as unknown as { _dot?: St.Widget })._dot;
            if (dot && isSide(currentEdge)) {
                dot.x_align = currentEdge === 'left' ? Clutter.ActorAlign.START : Clutter.ActorAlign.END;
                dot.y_align = Clutter.ActorAlign.CENTER;
                dot.translation_y = 0;
                dot.translation_x = currentEdge === 'left' ? -6 : 6;
            }
            const entries = launcherEntries();
            if (entries) {
                this.launcherId = entries.connect((appId) => {
                    if (appId === this.app.get_id()) this.syncLauncher();
                });
            }
            this.syncLauncher();
            // An app opened from anywhere bounces until its first window shows.
            this.stateId = this.app.connect('notify::state', () => {
                if (this.app.state === Shell.AppState.STARTING) this.bounce('launch');
            });
            if (this.app.state === Shell.AppState.STARTING) this.bounce('launch');
        }

        /** Bounces the icon away from the screen edge: while its app opens, or a few times for attention. */
        bounce(kind: BounceKind): void {
            if (!bounceOn) return;
            if (this.bouncing) {
                // Attention after an open, or again: count the bounces from now.
                if (kind === 'attention') Object.assign(this.bouncing, { kind, done: 0 });
                return;
            }
            const timeline = new Clutter.Timeline({ actor: this, duration: adjustAnimationTime(BOUNCE_TIME) });
            const bouncing = { timeline, kind, done: 0, started: GLib.get_monotonic_time() };
            this.bouncing = bouncing;
            timeline.connect('new-frame', () => this.lift(bounceOffset(timeline.get_progress(), currentIconSize * BOUNCE_HEIGHT * this.scale)));
            timeline.connect('completed', () => {
                bouncing.done++;
                const go = keepBouncing({
                    kind: bouncing.kind,
                    done: bouncing.done,
                    elapsed: (GLib.get_monotonic_time() - bouncing.started) / 1000,
                    starting: this.app.state === Shell.AppState.STARTING,
                });
                if (go && bounceOn) timeline.start();
                else this.stopBounce();
            });
            timeline.start();
        }

        private stopBounce(): void {
            if (!this.bouncing) return;
            this.bouncing.timeline.stop();
            this.bouncing = null;
            this.lift(0);
        }

        private get scale(): number {
            return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        }

        /** The icon, its badge and progress leave the shelf; the running dot stays. */
        private lift(offset: number): void {
            const [x, y] = bounceShift(currentEdge, offset);
            for (const actor of [this.icon as unknown as Clutter.Actor, this.badge, this.progress]) {
                actor.translation_x = x;
                actor.translation_y = y;
            }
            // The badge sits past the icon's corner.
            this.badge.translation_x += 5 * this.scale;
            this.badge.translation_y += -3 * this.scale;
        }

        private syncLauncher(): void {
            const entry = launcherEntries()?.get(this.app.get_id());
            const text = entry ? badgeText(entry) : null;
            this.badge.visible = text !== null;
            this.badge.text = text ?? '';
            const progress = entry ? progressOf(entry) : null;
            this.progress.visible = progress !== null;
            this.progressFill.scale_x = progress ?? 0;
            // As wide as most of the icon, at whatever size the dock has.
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            this.progress.width = Math.round(currentIconSize * 0.72 * scale);
        }

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

        // GNOME builds the app menu on the first right click: dress it like Macr's
        // menus, and open it away from the screen edge (DashIcon always opens it up).
        override popupMenu(): void {
            AppDisplay.AppIcon.prototype.popupMenu.call(this, menuSide());
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
            if (this.launcherId) launcherEntries()?.disconnect(this.launcherId);
            this.launcherId = 0;
            if (this.stateId) this.app.disconnect(this.stateId);
            this.stateId = 0;
            // Its actors are going: no need to put them back.
            this.bouncing?.timeline.stop();
            this.bouncing = null;
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

        constructor(iconSize: number, extensionPath: string, edge: DockEdge) {
            currentEdge = edge;
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
            if (isSide(edge)) {
                // A column down the side of the screen.
                (this._dashContainer as unknown as { vertical: boolean }).vertical = true;
                (this._box.layout_manager as Clutter.BoxLayout).orientation = Clutter.Orientation.VERTICAL;
            }
            liftLabel(this._showAppsIcon);
            if (this._showAppsIcon.child) growAway(this._showAppsIcon.child);
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
            growAway(appIcon);
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
                this.sizeSeparator();
                return;
            }
            const system = this._appSystem;
            this._appSystem = { get_running: () => [...system.get_running(), ...recent] } as unknown as Shell.AppSystem;
            try {
                super._redisplay();
            } finally {
                this._appSystem = system;
            }
            this.sizeSeparator();
        }

        /** The line between the kept and the other apps: across the row or the column. */
        private sizeSeparator(): void {
            const separator = this._separator;
            // Dash._init may redisplay before the constructor sets the size.
            if (!separator || !this.pixels) return;
            if (!isSide(currentEdge)) {
                separator.height = this.pixels;
                return;
            }
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            separator.set_size(this.pixels, scale);
            separator.x_align = Clutter.ActorAlign.CENTER;
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
            this.sizeSeparator();
        }

        /** Items in the order they are drawn, left to right or top to bottom. */
        rowItems(): Clutter.Actor[] {
            const box = this._box.get_children();
            return [this._showAppsIcon, ...box];
        }

        /** Bounces `app`'s icon, when it has one in this dock. */
        bounceApp(app: Shell.App, kind: BounceKind): void {
            for (const actor of this._box.get_children()) {
                const child = (actor as Dash.DashItemContainer).child;
                if (child instanceof MacrDashIcon && child.app === app) child.bounce(kind);
            }
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
