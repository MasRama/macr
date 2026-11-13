import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import type * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { windowCovers } from '../../shared/covered.js';
import { launchpad, onLaunchpadChanged } from '../../shared/launchpad-link.js';
import type { Rect } from '../../shared/logic/geometry.js';
import { growAway, liftLabel, MacrDash } from './dash.js';
import type { BounceKind } from './logic/bounce.js';
import { type DockEdge, type DockLayout, dockLayout, isSide } from './logic/edge.js';
import { magnify } from './logic/magnify.js';
import { MinimizedItem } from './minimized.js';
import { StackItem, stackSources } from './stack.js';
import { TrashItem } from './trash.js';

/** Gap between the dock and the screen edge. */
const MARGIN = 6;
const HIDE_DELAY = 400;
const SLIDE_TIME = 220;
const MAGNIFY = { maxScale: 1.6, reach: 2.5 };

type Disconnectable = { disconnect(id: number): void };

export interface DockOptions {
    extensionPath: string;
    settings: Gio.Settings;
    iconSize: number;
    autohide: boolean;
    magnification: boolean;
    /** The screen edge it sits on; docks are built again when it changes. */
    edge: DockEdge;
    /** The recent apps to show after the running ones. */
    recentApps: () => Shell.App[];
}

/**
 * The macOS dock: a glass shelf along the bottom (or down a side) of one
 * monitor holding Show Apps, the dash's apps and the Trash. It floats over
 * windows (no struts), slides away when a window on its monitor covers it
 * and magnifies icons under the pointer.
 */
export class Dock {
    readonly actor: St.Widget;
    readonly dash: MacrDash;
    private readonly background: St.Widget;
    /** Invisible, reaches the screen edge so the pointer stays "on" the dock between it and the edge. */
    private readonly hitArea: St.Widget;
    private readonly trash: TrashItem;
    private stacks: StackItem[] = [];
    /** Minimized windows waiting before the Trash, and ones on their way out. */
    private readonly minimized = new Map<Meta.Window, MinimizedItem>();
    private readonly leaving = new Map<Meta.Window, MinimizedItem>();
    private readonly divider: St.Widget;
    /** Along the screen edge: brings a hidden dock back. */
    private readonly strip: St.Widget;
    private readonly ids: [Disconnectable, number][] = [];
    private focusIds: [Disconnectable, number][] = [];
    private options: DockOptions;
    private readonly edge: DockEdge;
    /** Where the dock is placed, once it is. */
    private layout: DockLayout | null = null;
    private hidden = false;
    private dragging = false;
    private hideTimeout = 0;
    private placeLater = 0;
    private unlinkLaunchpad: (() => void) | null = null;

    constructor(
        options: DockOptions,
        readonly monitorIndex: number,
    ) {
        this.options = options;
        this.edge = options.edge;
        this.actor = new St.Widget({ name: 'macrDock', style_class: 'macr-dock', reactive: true, track_hover: true });
        if (isSide(this.edge)) {
            this.actor.add_style_class_name('macr-dock-side');
            this.actor.add_style_class_name(`macr-dock-${this.edge}`);
        }
        (this.actor as unknown as { _delegate: Dock })._delegate = this;
        this.hitArea = new St.Widget();
        this.actor.add_child(this.hitArea);
        this.background = new St.Widget({ style_class: 'macr-dock-background' });
        this.background.add_effect_with_name('macr-blur', new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
        this.actor.add_child(this.background);

        this.dash = new MacrDash(options.iconSize, options.extensionPath, this.edge);
        this.dash.recentApps = options.recentApps;
        this.actor.add_child(this.dash);
        const container = this.dash._dashContainer;
        // Show Apps first, like Launchpad next to Finder.
        container.set_child_at_index(this.dash._showAppsIcon, 0);
        this.divider = new St.Widget({ style_class: 'macr-dock-divider', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        container.add_child(this.divider);
        this.trash = new TrashItem();
        container.add_child(this.trash);
        this.trash.show(false);
        this.hookUp(this.trash);
        this.dash.extraItems.push(this.trash);
        this.buildStacks();

        this.strip = new St.Widget({ name: 'macrDockEdge', reactive: true, track_hover: true });

        Main.layoutManager.addChrome(this.actor, { affectsInputRegion: true, trackFullscreen: true });
        Main.layoutManager.addChrome(this.strip, { affectsInputRegion: true, trackFullscreen: true });
        // Sizing reads theme nodes, so the dock has to be on the stage first.
        this.dash._adjustIconSize();
        this.strip.hide();

        this.listen(this.dash, 'notify::allocation', () => this.queuePlace());
        this.listen(this.actor, 'notify::hover', () => this.onHover());
        this.listen(options.settings, 'changed::dock-stacks', () => this.buildStacks());
        this.listen(this.actor, 'motion-event', (_actor: unknown, event: Clutter.Event) => this.onMotion(event));
        this.listen(this.actor, 'scroll-event', (_actor: unknown, event: Clutter.Event) => Main.wm.handleWorkspaceScroll(event));
        this.listen(this.strip, 'notify::hover', () => {
            if (this.strip.hover) this.reveal();
        });

        const showApps = this.dash.showAppsButton;
        const overviewApps = Main.overview.dash.showAppsButton;
        this.listen(showApps, 'clicked', () => {
            const pad = launchpad();
            if (pad) pad.toggle();
            else if (Main.overview.visible && overviewApps.checked) Main.overview.hide();
            else Main.overview.showApps();
            this.syncShowApps();
        });
        this.listen(overviewApps, 'notify::checked', () => this.syncShowApps());
        this.unlinkLaunchpad = onLaunchpadChanged(() => this.syncShowApps());

        const overview = Main.overview as unknown as { connect(signal: string, callback: () => void): number } & Disconnectable;
        this.ids.push([overview, overview.connect('showing', () => this.updateVisibility())]);
        this.ids.push([overview, overview.connect('hidden', () => this.onOverviewHidden())]);
        this.ids.push([overview, overview.connect('item-drag-begin', () => this.setDragging(true))]);
        this.ids.push([overview, overview.connect('item-drag-end', () => this.setDragging(false))]);
        this.ids.push([overview, overview.connect('item-drag-cancelled', () => this.setDragging(false))]);

        this.listen(global.display, 'restacked', () => this.updateVisibility());
        this.listen(global.display, 'notify::focus-window', () => this.trackFocusWindow());
        this.listen(global.display, 'grab-op-end', () => this.updateVisibility());
        this.listen(global.workspace_manager, 'active-workspace-changed', () => this.updateVisibility());
        this.trackFocusWindow();
        this.queuePlace();
    }

    /** The folder stacks between the divider and the Trash, again when the list changes. */
    private buildStacks(): void {
        for (const stack of this.stacks) {
            this.dash.extraItems.splice(this.dash.extraItems.indexOf(stack), 1);
            stack.destroy();
        }
        this.stacks = stackSources(this.options.settings).map((source) => {
            const stack = new StackItem(this.options.settings, source);
            this.dash._dashContainer.insert_child_below(stack, this.trash);
            stack.show(false);
            this.hookUp(stack);
            this.dash.extraItems.push(stack);
            // The dock stays while a stack is open.
            stack.connect('open-changed', () => this.updateVisibility());
            return stack;
        });
        // Sizing reads theme nodes: only once the dock is on the stage.
        if (this.actor.get_stage()) {
            this.dash._adjustIconSize();
            this.queuePlace();
        }
    }

    /** Labels for one of the dock's own items, past its magnified icon; it grows away from the edge. */
    private hookUp(item: Dash.DashItemContainer): void {
        this.dash._hookUpLabel(item);
        liftLabel(item);
        if (item.child) growAway(item.child);
    }

    /** Shows `windows` (oldest first) as thumbnails before the Trash. */
    setMinimized(windows: Meta.Window[]): void {
        const keep = new Set(windows);
        for (const [window, item] of [...this.minimized]) {
            if (keep.has(window)) continue;
            this.minimized.delete(window);
            this.dash.extraItems.splice(this.dash.extraItems.indexOf(item), 1);
            // Still the genie's target while the window comes back out of it.
            this.leaving.set(window, item);
            item.connect('destroy', () => {
                if (this.leaving.get(window) === item) this.leaving.delete(window);
            });
            item.animateOutAndDestroy();
        }
        const container = this.dash._dashContainer;
        for (const window of windows) {
            let item = this.minimized.get(window);
            if (!item) {
                item = new MinimizedItem(window);
                container.insert_child_below(item, this.trash);
                item.show(false);
                (item.icon as unknown as { setIconSize(size: number): void }).setIconSize(this.dash.iconPixels);
                this.hookUp(item);
                this.dash.extraItems.push(item);
                this.minimized.set(window, item);
            }
            container.set_child_below_sibling(item, this.trash);
        }
        this.queuePlace();
    }

    /** The thumbnail of a minimized `window`, where the genie pours it. */
    thumbnailOf(window: Meta.Window): Clutter.Actor | null {
        return (this.minimized.get(window) ?? this.leaving.get(window))?.target ?? null;
    }

    /** The recent apps changed: list the apps again. */
    refreshApps(): void {
        this.dash._queueRedisplay();
    }

    setOptions(options: DockOptions): void {
        const sizeChanged = options.iconSize !== this.options.iconSize;
        this.options = options;
        if (sizeChanged) this.dash.setIconPixels(options.iconSize);
        if (!options.magnification) this.applyMagnification(null);
        this.updateVisibility();
    }

    /** The dock icon of `app`, where the genie effect pours its windows. */
    /** Bounces `app`'s icon, when the dock has one. */
    bounceApp(app: Shell.App, kind: BounceKind): void {
        this.dash.bounceApp(app, kind);
    }

    iconOf(app: Shell.App): Clutter.Actor | null {
        return this.dash.iconOf(app);
    }

    destroy(): void {
        if (this.hideTimeout) GLib.source_remove(this.hideTimeout);
        this.hideTimeout = 0;
        if (this.placeLater) global.compositor.get_laters().remove(this.placeLater);
        this.placeLater = 0;
        for (const [target, id] of [...this.ids, ...this.focusIds]) target.disconnect(id);
        this.ids.length = 0;
        this.focusIds = [];
        this.unlinkLaunchpad?.();
        this.unlinkLaunchpad = null;
        this.strip.destroy();
        this.actor.destroy();
    }

    private listen(target: unknown, signal: string, callback: (...args: never[]) => unknown): void {
        const object = target as { connect(signal: string, callback: (...args: never[]) => unknown): number } & Disconnectable;
        this.ids.push([object, object.connect(signal, callback)]);
    }

    // Positions change outside the allocation cycle that reported them.
    private queuePlace(): void {
        if (this.placeLater) return;
        this.placeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.placeLater = 0;
            this.place();
            return GLib.SOURCE_REMOVE;
        });
    }

    private place(): void {
        const monitor = Main.layoutManager.monitors[this.monitorIndex];
        if (!monitor) return;
        const size = this.dashSize();
        const layout = dockLayout(this.edge, monitor, size, MARGIN);
        this.layout = layout;
        this.dash.set_position(layout.shelf.x, layout.shelf.y);
        this.background.set_position(layout.shelf.x, layout.shelf.y);
        this.background.set_size(size.width, size.height);
        this.hitArea.set_position(layout.hit.x, layout.hit.y);
        this.hitArea.set_size(layout.hit.width, layout.hit.height);
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        if (isSide(this.edge)) this.divider.set_size(this.options.iconSize * 0.7 * scale, scale);
        else this.divider.height = this.options.iconSize * 0.7;
        this.actor.set_position(layout.actor.x, layout.actor.y);
        this.strip.set_position(layout.strip.x, layout.strip.y);
        this.strip.set_size(layout.strip.width, layout.strip.height);
        if (this.hidden) this.actor.set_translation(layout.hidden.x, layout.hidden.y, 0);
        this.updateVisibility();
    }

    /** The bottom of the screen the overview leaves to this dock, once it is placed. */
    get overviewSpace(): number {
        return this.layout?.overviewSpace ?? 0;
    }

    /** The dash's natural size: a row along the bottom, a column down a side. */
    private dashSize(): { width: number; height: number } {
        if (isSide(this.edge)) {
            const [, height] = this.dash.get_preferred_height(-1);
            const [, width] = this.dash.get_preferred_width(height);
            return { width, height };
        }
        const [, width] = this.dash.get_preferred_width(-1);
        const [, height] = this.dash.get_preferred_height(width);
        return { width, height };
    }

    /** Where the dock sits when shown, in stage coordinates. */
    private restingRect(): Rect {
        return this.layout?.resting ?? { x: this.actor.x, y: this.actor.y, width: this.background.width, height: this.background.height };
    }

    private trackFocusWindow(): void {
        for (const [target, id] of this.focusIds) target.disconnect(id);
        this.focusIds = [];
        const window = global.display.focus_window;
        if (window) {
            this.focusIds.push([window, window.connect('position-changed', () => this.updateVisibility())]);
            this.focusIds.push([window, window.connect('size-changed', () => this.updateVisibility())]);
        }
        this.updateVisibility();
    }

    private covered(): boolean {
        return windowCovers(this.restingRect(), this.monitorIndex);
    }

    /** The pointer is over the dock or the gap between it and the screen edge. */
    private pointerOnDock(): boolean {
        if (this.actor.hover) return true;
        const layout = this.layout;
        if (!layout) return false;
        const [px, py] = global.get_pointer();
        const x = layout.actor.x + layout.hit.x;
        const y = layout.actor.y + layout.hit.y;
        return px >= x && px < x + layout.hit.width && py >= y && py < y + layout.hit.height;
    }

    private updateVisibility(): void {
        if (Main.overview.visible || !this.options.autohide || this.pointerOnDock() || this.dragging || this.stacks.some((stack) => stack.isOpen)) {
            this.cancelHide();
            this.setHidden(false);
            return;
        }
        if (this.covered()) this.scheduleHide();
        else {
            this.cancelHide();
            this.setHidden(false);
        }
    }

    private scheduleHide(): void {
        if (this.hidden || this.hideTimeout) return;
        this.hideTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY, () => {
            this.hideTimeout = 0;
            if (!this.pointerOnDock() && this.covered() && !Main.overview.visible && !this.dragging) this.setHidden(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    private cancelHide(): void {
        if (!this.hideTimeout) return;
        GLib.source_remove(this.hideTimeout);
        this.hideTimeout = 0;
    }

    private setHidden(hidden: boolean): void {
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        if (hidden) this.applyMagnification(null);
        const away = this.layout?.hidden ?? { x: 0, y: this.background.height + MARGIN + 4 };
        this.actor.ease({
            translation_x: hidden ? away.x : 0,
            translation_y: hidden ? away.y : 0,
            duration: SLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.strip.visible = hidden;
    }

    private reveal(): void {
        this.cancelHide();
        this.setHidden(false);
        // Slides away again unless the pointer moves onto it.
        if (this.covered()) this.scheduleHide();
    }

    private onHover(): void {
        if (!this.actor.hover) {
            this.applyMagnification(null);
            this.updateVisibility();
        } else {
            this.cancelHide();
        }
    }

    private onOverviewHidden(): void {
        this.syncShowApps();
        this.updateVisibility();
    }

    private syncShowApps(): void {
        // Named after what it opens.
        const label = launchpad() ? 'Launchpad' : GLib.dgettext('gnome-shell', 'Show Apps');
        (this.dash._showAppsIcon as unknown as { setLabelText(text: string): void }).setLabelText(label);
        this.dash.showAppsButton.checked = (launchpad()?.isOpen ?? false) || (Main.overview.visible && Main.overview.dash.showAppsButton.checked);
    }

    private setDragging(dragging: boolean): void {
        this.dragging = dragging;
        if (dragging) this.applyMagnification(null);
        this.updateVisibility();
    }

    private onMotion(event: Clutter.Event): boolean {
        if (this.options.magnification && !this.dragging && !this.hidden) {
            const [x, y] = event.get_coords();
            this.applyMagnification(isSide(this.edge) ? y : x);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /** Magnifies the icons around `pointer` (stage x, or y down a side), or puts them back with null. */
    applyMagnification(pointer: number | null): void {
        const items = this.rowItems();
        if (items.length === 0) return;
        const side = isSide(this.edge);
        const shift = side ? 'translation_y' : 'translation_x';
        const length = side ? 'height' : 'width';
        const centers = items.map((item) => this.restingCenter(item));
        const fixed = items.map((item) => item === this.divider || item === this.dash._separator || !(item as { child?: unknown }).child);
        const span = this.dash._showAppsIcon[length] || this.options.iconSize + 12;
        const m = magnify(centers, span, pointer, { ...MAGNIFY, fixed });
        const easing = pointer === null ? { duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD } : { duration: 0 };
        items.forEach((item, i) => {
            item.remove_transition(shift);
            if (easing.duration) item.ease({ [shift]: 0, ...easing });
            else item[shift] = m.shifts[i];
            const child = (item as { child?: Clutter.Actor | null }).child;
            if (child && !fixed[i]) {
                if (easing.duration) child.ease({ scale_x: 1, scale_y: 1, ...easing });
                else child.set_scale(m.scales[i], m.scales[i]);
            }
        });
        const rest = this.dashSize()[length];
        if (easing.duration) {
            this.background.ease({ [shift]: 0, ...easing });
            this.background.ease({ [length]: rest, ...easing });
        } else {
            this.background[shift] = -m.extraLeft;
            this.background[length] = rest + m.extra;
        }
    }

    private rowItems(): Clutter.Actor[] {
        const items = new Set<Clutter.Actor>([...this.minimized.values()]);
        const minimized = this.dash._dashContainer.get_children().filter((child) => items.has(child));
        return [...this.dash.rowItems(), this.divider, ...this.stacks, ...minimized, this.trash].filter((item) => item.visible);
    }

    /** Centre of `item` without its magnification shift, in stage x (y down a side). */
    private restingCenter(item: Clutter.Actor): number {
        const parent = item.get_parent();
        const [parentX, parentY] = parent ? parent.get_transformed_position() : [0, 0];
        const box = item.get_allocation_box();
        if (isSide(this.edge)) return (parentY ?? 0) + box.y1 + (box.y2 - box.y1) / 2;
        return (parentX ?? 0) + box.x1 + (box.x2 - box.x1) / 2;
    }
}
