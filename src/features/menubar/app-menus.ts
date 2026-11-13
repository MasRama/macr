import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import type { FocusTracker } from './focus.js';
import { arrangeMenus, groupEntries, readMenu, type MenuNode, type MenuReader, type SubmenuNode } from './logic/app-menus.js';
import { searchMenus, submenuActions, type FoundItem } from './logic/menu-search.js';
import { separator, type MenuLike } from './menu-kit.js';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };

type AddEntry = (entry: PopupMenu.PopupBaseMenuItem) => void;
type ItemNode = Extract<MenuNode, { kind: 'item' }>;

/** Where a bar puts the app's menus: before its Window menu, or after it (Help). */
export type PlaceMenu = (button: PanelMenu.Button, afterWindow: boolean) => void;

/**
 * The menus a window shares over D-Bus: GtkApplication apps (GTK 3 and 4,
 * LibreOffice) export their menu bar as a GMenuModel and its actions as
 * action groups, and tell the compositor where.
 */
class MenuSource {
    readonly model: Gio.MenuModel;
    private readonly groups = new Map<string, Gio.DBusActionGroup>();

    static for(window: Meta.Window | null): MenuSource | null {
        const bus = window?.get_gtk_unique_bus_name();
        const path = window?.get_gtk_menubar_object_path();
        return window && bus && path ? new MenuSource(window, bus, path) : null;
    }

    private constructor(readonly window: Meta.Window, bus: string, path: string) {
        const connection = Gio.DBus.session;
        this.model = Gio.DBusMenuModel.get(connection, bus, path);
        const paths: [string, string | null][] = [
            ['app', window.get_gtk_application_object_path()],
            ['win', window.get_gtk_window_object_path()],
        ];
        for (const [prefix, objectPath] of paths) {
            if (!objectPath) continue;
            const group = Gio.DBusActionGroup.get(connection, bus, objectPath);
            // Remote groups load lazily; asking once starts the load.
            group.list_actions();
            this.groups.set(prefix, group);
        }
    }

    /** The app's menus as the bar shows them, read now; `seen` gets every model read. */
    menus(seen = new Set<Gio.MenuModel>()): { menus: SubmenuNode[]; help: SubmenuNode | null } {
        return arrangeMenus(readMenu(reader(this.model, seen)));
    }

    /** An item's action, whether the app has it and whether it is enabled now. */
    state(node: ItemNode): { group: Gio.DBusActionGroup | null; name: string; exists: boolean; enabled: boolean } {
        const [group, name] = (node.action ? this.resolve(node.action) : null) ?? [null, ''];
        const exists = !!group?.has_action(name);
        return { group, name, exists, enabled: exists && !!group?.get_action_enabled(name) };
    }

    /** Whether an item shows at all, by its hidden-when rule. */
    shows(node: ItemNode): boolean {
        const { exists, enabled } = this.state(node);
        return !(node.hiddenWhen === 'action-missing' && !exists) && !(node.hiddenWhen === 'action-disabled' && !enabled);
    }

    /** "win.copy" as its group and name. */
    resolve(action: string): [Gio.DBusActionGroup, string] | null {
        const dot = action.indexOf('.');
        const group = dot > 0 ? this.groups.get(action.slice(0, dot)) : undefined;
        return group ? [group, action.slice(dot + 1)] : null;
    }

    get actionGroups(): Gio.DBusActionGroup[] {
        return [...this.groups.values()];
    }
}

/** Reads a live model and remembers every model it read, to watch them. */
function reader(model: Gio.MenuModel, seen: Set<Gio.MenuModel>): MenuReader {
    seen.add(model);
    return {
        source: model,
        count: () => model.get_n_items(),
        attribute: (index, name) => {
            const value = model.get_item_attribute_value(index, name, null);
            if (!value) return null;
            return name === 'target' ? value : value.deepUnpack();
        },
        link: (index, name) => {
            const linked = model.get_item_link(index, name);
            return linked ? reader(linked, seen) : null;
        },
    };
}

/** Most items the Help menu's search lists. */
const FOUND = 12;

/**
 * One of the app's menus in the bar. Its items are read from the app each
 * time it opens and re-read while open when the app changes them (apps such
 * as LibreOffice fill a menu only once it is shown). Help starts with a
 * search field that finds items in all of the app's menus, as on macOS.
 */
class AppMenuButton {
    readonly button: PanelMenu.Button;
    private readonly menu: PopupMenu.PopupMenu;
    /** The app's own items; Help's search sits above them. */
    private readonly body = new PopupMenu.PopupMenuSection();
    private readonly search: HelpSearch | null;
    private watched: [Signals, number][] = [];
    private refillId = 0;
    private openSubmenu: string | null = null;
    private readonly openActions = new Set<string>();
    /** Items made by the last fill with no check, and whether any item can be checked. */
    private plain: PopupMenu.PopupBaseMenuItem[] = [];
    private checkable = false;
    /** Submenus made by the last fill, with their open-state handler. */
    private submenus: [PopupMenu.PopupSubMenuMenuItem, number][] = [];

    constructor(private readonly source: MenuSource, private readonly node: SubmenuNode, help: boolean) {
        this.button = new PanelMenu.Button(0.0, `Macr ${node.label} Menu`, false);
        this.button.add_style_class_name('macr-menu-button');
        this.button.add_child(new St.Label({ text: node.label, y_align: Clutter.ActorAlign.CENTER }));
        this.menu = this.button.menu as PopupMenu.PopupMenu;
        styleMenu(this.menu);
        this.search = help ? new HelpSearch(this.menu, source, (action) => this.setShown(action, true)) : null;
        this.menu.addMenuItem(this.body);
        (this.menu as unknown as Signals).connect('open-state-changed', (_menu: never, open: never) => this.onOpen(open as unknown as boolean));
        // A menu with no items never opens.
        if (!this.search) this.body.addMenuItem(new PopupMenu.PopupMenuItem(node.label));
        this.button.connect('destroy', () => {
            this.stop();
            this.search?.destroy();
        });
    }

    /** The menu as the app has it now; it may have replaced it since. */
    private current(): SubmenuNode {
        const { menus, help } = this.source.menus();
        return [...menus, ...(help ? [help] : [])].find((menu) => menu.label === this.node.label) ?? this.node;
    }

    private onOpen(open: boolean): void {
        if (open) {
            syncMenuScheme(this.menu);
            this.setShown(this.current().submenuAction, true);
            this.fill();
            this.search?.open();
        } else {
            this.stop();
            this.search?.close();
        }
    }

    /** Lets the app fill a submenu as it is shown, as GTK does. */
    private setShown(action: string | null, shown: boolean): void {
        if (!action) return;
        const resolved = this.source.resolve(action);
        if (!resolved) return;
        if (shown === this.openActions.has(action)) return;
        if (shown) this.openActions.add(action);
        else this.openActions.delete(action);
        const [group, name] = resolved;
        if (group.has_action(name)) group.change_action_state(name, GLib.Variant.new_boolean(shown));
    }

    private stop(): void {
        this.unwatch();
        if (this.refillId) GLib.source_remove(this.refillId);
        this.refillId = 0;
        for (const action of [...this.openActions]) this.setShown(action, false);
        this.openSubmenu = null;
    }

    private unwatch(): void {
        for (const [object, id] of this.watched) object.disconnect(id);
        this.watched = [];
    }

    private queueRefill(): void {
        if (this.refillId || !this.menu.isOpen) return;
        this.refillId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.refillId = 0;
            if (this.menu.isOpen) this.fill();
            return GLib.SOURCE_REMOVE;
        });
    }

    private fill(): void {
        this.unwatch();
        const model = this.current().source as Gio.MenuModel | undefined;
        if (!model && !this.search) return;
        const seen = new Set<Gio.MenuModel>();
        // An app with no Help menu of its own still gets Help's search.
        const nodes = model ? readMenu(reader(model, seen)) : [];
        for (const watched of seen) this.watch(watched, 'items-changed');
        for (const group of this.source.actionGroups) {
            for (const signal of ['action-added', 'action-removed', 'action-enabled-changed', 'action-state-changed']) this.watch(group, signal);
        }

        const reopen = this.openSubmenu;
        this.dropSubmenus();
        this.body.removeAll();
        this.plain = [];
        this.checkable = false;
        this.addNodes(this.body, nodes, reopen);
        // macOS keeps a check column for every item once one can be checked.
        if (this.checkable) {
            for (const item of this.plain) item.setOrnament(PopupMenu.Ornament.NONE);
        }
        if (this.search) {
            if (!this.body.isEmpty()) this.body.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 0);
        } else if (this.body.isEmpty()) {
            const empty = new PopupMenu.PopupMenuItem('');
            empty.setSensitive(false);
            this.menu.addMenuItem(empty);
        }
    }

    /** Closes the old submenus quietly before their items go. */
    private dropSubmenus(): void {
        for (const [entry, id] of this.submenus) {
            entry.menu.disconnect(id);
            if (entry.menu.isOpen) entry.menu.close(false);
        }
        this.submenus = [];
    }

    private watch(object: object, signal: string): void {
        const target = object as Signals;
        this.watched.push([target, target.connect(signal, () => this.queueRefill())]);
    }

    /** Sections become groups split by separators, as in a GTK menu. */
    private addNodes(menu: MenuLike, nodes: MenuNode[], reopen: string | null): void {
        let shown = false;
        for (const group of groupEntries(nodes)) {
            let separated = !shown;
            for (const node of group) {
                const add = (entry: PopupMenu.PopupBaseMenuItem) => {
                    if (!separated) separator(menu);
                    separated = true;
                    shown = true;
                    menu.addMenuItem(entry);
                };
                if (node.kind === 'submenu') this.addSubmenu(add, node, reopen);
                else this.addItem(add, node);
            }
        }
    }

    private addSubmenu(add: AddEntry, node: SubmenuNode, reopen: string | null): void {
        const entry = new PopupMenu.PopupSubMenuMenuItem(node.label);
        this.plain.push(entry);
        add(entry);
        this.addNodes(entry.menu, node.children, null);
        const id = (entry.menu as unknown as Signals).connect('open-state-changed', (_menu: never, open: never) => {
            const shown = open as unknown as boolean;
            this.openSubmenu = shown ? node.label : this.openSubmenu === node.label ? null : this.openSubmenu;
            this.setShown(node.submenuAction, shown);
        });
        this.submenus.push([entry, id]);
        if (node.label === reopen) entry.setSubmenuShown(true);
    }

    private addItem(add: AddEntry, node: ItemNode): void {
        if (!this.source.shows(node)) return;
        const { group, name, exists, enabled } = this.source.state(node);

        // Added first: an item changed while out of the stage logs criticals.
        const entry = new PopupMenu.PopupMenuItem(node.label);
        add(entry);
        if (node.accel) entry.add_child(new St.Label({ text: node.accel, style_class: 'macr-accel', x_expand: true, x_align: Clutter.ActorAlign.END }));
        entry.setSensitive(enabled);
        const state = exists ? group?.get_action_state(name) : null;
        const target = node.target as GLib.Variant | null;
        if (state && (target || state.get_type_string() === 'b')) this.checkable = true;
        else this.plain.push(entry);
        if (state && target) entry.setOrnament(state.equal(target) ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        else if (state?.get_type_string() === 'b') entry.setOrnament(state.get_boolean() ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        entry.connect('activate', () => group?.activate_action(name, target));
    }
}

/**
 * The search field at the top of Help. As the user types it reads all of the
 * app's menus (asking the app to fill the ones it fills only when shown) and
 * lists the matching items under it; Enter or a click picks one.
 */
class HelpSearch {
    private readonly section = new PopupMenu.PopupMenuSection();
    private readonly results = new PopupMenu.PopupMenuSection();
    private readonly entry: St.Entry;
    private watched: [Signals, number][] = [];
    private searchId = 0;
    private focusId = 0;

    constructor(private readonly menu: PopupMenu.PopupMenu, private readonly source: MenuSource, private readonly fill: (action: string) => void) {
        const row = new PopupMenu.PopupBaseMenuItem({ activate: false, hover: false, can_focus: false, style_class: 'macr-help-search' });
        row.add_child(new St.Label({ text: _('Search'), y_align: Clutter.ActorAlign.CENTER }));
        this.entry = new St.Entry({ style_class: 'macr-help-search-entry', can_focus: true, x_expand: true });
        row.add_child(this.entry);
        this.section.addMenuItem(row);
        this.section.addMenuItem(this.results);
        menu.addMenuItem(this.section);
        const text = this.entry.clutter_text;
        text.connect('text-changed', () => this.queueSearch());
        text.connect('activate', () => this.pickFirst());
        text.connect('key-press-event', (_text: Clutter.Actor, event: Clutter.Event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Down) return Clutter.EVENT_PROPAGATE;
            const first = this.results.firstMenuItem as PopupMenu.PopupBaseMenuItem | null;
            if (first) first.grab_key_focus();
            return first ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
    }

    /** The field takes the keyboard as the menu opens, so typing searches. */
    open(): void {
        if (this.focusId) GLib.source_remove(this.focusId);
        this.focusId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.focusId = 0;
            if (this.menu.isOpen) this.entry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    close(): void {
        this.stop();
        this.entry.set_text('');
        this.results.removeAll();
    }

    /** With the menu: its actors are gone already, so only what Macr started is stopped. */
    destroy(): void {
        this.stop();
        if (this.focusId) GLib.source_remove(this.focusId);
        this.focusId = 0;
    }

    private stop(): void {
        this.unwatch();
        if (this.searchId) GLib.source_remove(this.searchId);
        this.searchId = 0;
    }

    private unwatch(): void {
        for (const [object, id] of this.watched) object.disconnect(id);
        this.watched = [];
    }

    private queueSearch(): void {
        if (this.searchId) return;
        this.searchId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.searchId = 0;
            if (this.menu.isOpen) this.search();
            return GLib.SOURCE_REMOVE;
        });
    }

    private search(): void {
        this.unwatch();
        this.results.removeAll();
        const query = this.entry.get_text();
        if (!query.trim()) return;
        const seen = new Set<Gio.MenuModel>();
        const { menus } = this.source.menus(seen);
        // Menus filled as they are shown fill now, and the search runs again.
        for (const action of submenuActions(menus)) this.fill(action);
        for (const model of seen) {
            const target = model as unknown as Signals;
            this.watched.push([target, target.connect('items-changed', () => this.queueSearch())]);
        }
        const found = searchMenus(menus, query, FOUND).filter((node) => this.source.shows(node));
        if (found.length === 0) {
            const none = new PopupMenu.PopupMenuItem(_('No menu items found'));
            this.results.addMenuItem(none);
            none.setSensitive(false);
            return;
        }
        for (const node of found) this.add(node);
    }

    private add(node: FoundItem): void {
        const { group, name, enabled } = this.source.state(node);
        const entry = new PopupMenu.PopupMenuItem(node.label);
        this.results.addMenuItem(entry);
        entry.add_child(new St.Label({ text: node.path.join(' ▸ '), style_class: 'macr-accel', x_expand: true, x_align: Clutter.ActorAlign.END }));
        entry.setSensitive(enabled);
        entry.connect('activate', () => group?.activate_action(name, node.target as GLib.Variant | null));
    }

    private pickFirst(): void {
        const first = this.results.firstMenuItem as PopupMenu.PopupBaseMenuItem | null;
        if (first?.sensitive) first.activate(Clutter.get_current_event());
    }
}

/**
 * The focused app's own menus (File, Edit, View…) in the menu bar, between
 * the app name and the Window menu, with Help after Window, as on macOS.
 * Help is there for every app that shares menus, with its search on top.
 * Apps that share no menus keep only Macr's app and Window menus.
 */
export class AppMenus {
    private source: MenuSource | null = null;
    private buttons: PanelMenu.Button[] = [];
    private labels = '';
    private modelId = 0;
    private rebuildId = 0;

    constructor(private readonly focus: FocusTracker, private readonly place: PlaceMenu) {
        this.sync();
    }

    destroy(): void {
        this.setSource(null);
        if (this.rebuildId) GLib.source_remove(this.rebuildId);
        this.rebuildId = 0;
        this.clear();
    }

    /** Follows the focused window. */
    sync(): void {
        const window = this.focus.window;
        if (this.source?.window === window) return;
        this.setSource(MenuSource.for(window));
        this.rebuild();
    }

    private setSource(source: MenuSource | null): void {
        if (this.source && this.modelId) this.source.model.disconnect(this.modelId);
        this.modelId = 0;
        this.source = source;
        if (source) this.modelId = source.model.connect('items-changed', () => this.queueRebuild());
    }

    private queueRebuild(): void {
        if (this.rebuildId) return;
        this.rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.rebuildId = 0;
            this.rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** New buttons only when the list of menus changed, so an open menu stays open. */
    private rebuild(): void {
        const source = this.source;
        const { menus, help: own } = source ? source.menus() : { menus: [], help: null };
        const help = own ?? (menus.length > 0 ? { kind: 'submenu' as const, label: _('Help'), submenuAction: null, children: [] } : null);
        const labels = [...menus, ...(help ? [help] : [])].map((menu) => menu.label).join('\n');
        if (labels === this.labels && this.buttons.length > 0) return;
        this.clear();
        this.labels = labels;
        if (!source) return;
        for (const menu of menus) this.add(source, menu, false);
        if (help) this.add(source, help, true);
    }

    private add(source: MenuSource, node: SubmenuNode, afterWindow: boolean): void {
        const { button } = new AppMenuButton(source, node, afterWindow);
        this.place(button, afterWindow);
        this.buttons.push(button);
    }

    private clear(): void {
        for (const button of this.buttons) button.destroy();
        this.buttons = [];
        this.labels = '';
    }
}
