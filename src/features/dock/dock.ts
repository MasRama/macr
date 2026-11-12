import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { launchpad, onLaunchpadChanged } from '../../shared/launchpad-link.js';
import { MacrDash } from './dash.js';
import { magnify } from './logic/magnify.js';
import { overlaps, type Rect } from './logic/rules.js';
import { TrashItem } from './trash.js';

/** Gap between the dock and the bottom of the screen. */
const MARGIN = 6;
const HIDE_DELAY = 400;
const SLIDE_TIME = 220;
const MAGNIFY = { maxScale: 1.6, reach: 2.5 };

type Disconnectable = { disconnect(id: number): void };

export interface DockOptions {
    extensionPath: string;
    iconSize: number;
    autohide: boolean;
    magnification: boolean;
}

/**
 * The macOS dock: a glass shelf at the bottom of one monitor holding Show
 * Apps, the dash's apps and the Trash. It floats over windows (no struts),
 * slides away when a window on its monitor covers it and magnifies icons
 * under the pointer.
 */
export class Dock {
    readonly actor: St.Widget;
    readonly dash: MacrDash;
    private readonly background: St.Widget;
    /** Invisible, reaches the screen edge so the pointer stays "on" the dock below it. */
    private readonly hitArea: St.Widget;
    private readonly trash: TrashItem;
    private readonly divider: St.Widget;
    private readonly edge: St.Widget;
    private readonly ids: [Disconnectable, number][] = [];
    private focusIds: [Disconnectable, number][] = [];
    private options: DockOptions;
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
        this.actor = new St.Widget({ name: 'macrDock', style_class: 'macr-dock', reactive: true, track_hover: true });
        (this.actor as unknown as { _delegate: Dock })._delegate = this;
        this.hitArea = new St.Widget();
        this.actor.add_child(this.hitArea);
        this.background = new St.Widget({ style_class: 'macr-dock-background' });
        this.background.add_effect_with_name('macr-blur', new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
        this.actor.add_child(this.background);

        this.dash = new MacrDash(options.iconSize, options.extensionPath);
        this.actor.add_child(this.dash);
        const container = this.dash._dashContainer;
        // Show Apps first, like Launchpad next to Finder.
        container.set_child_at_index(this.dash._showAppsIcon, 0);
        this.divider = new St.Widget({ style_class: 'macr-dock-divider', y_align: Clutter.ActorAlign.CENTER });
        container.add_child(this.divider);
        this.trash = new TrashItem();
        container.add_child(this.trash);
        this.trash.show(false);
        this.dash._hookUpLabel(this.trash);
        this.dash.extraItems.push(this.trash);
        this.dash._adjustIconSize();

        this.edge = new St.Widget({ name: 'macrDockEdge', reactive: true, track_hover: true, height: 1 });

        Main.layoutManager.addChrome(this.actor, { affectsInputRegion: true, trackFullscreen: true });
        Main.layoutManager.addChrome(this.edge, { affectsInputRegion: true, trackFullscreen: true });
        this.edge.hide();

        this.listen(this.dash, 'notify::allocation', () => this.queuePlace());
        this.listen(this.actor, 'notify::hover', () => this.onHover());
        this.listen(this.actor, 'motion-event', (_actor: unknown, event: Clutter.Event) => this.onMotion(event));
        this.listen(this.actor, 'scroll-event', (_actor: unknown, event: Clutter.Event) => Main.wm.handleWorkspaceScroll(event));
        this.listen(this.edge, 'notify::hover', () => {
            if (this.edge.hover) this.reveal();
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

    setOptions(options: DockOptions): void {
        const sizeChanged = options.iconSize !== this.options.iconSize;
        this.options = options;
        if (sizeChanged) this.dash.setIconPixels(options.iconSize);
        if (!options.magnification) this.applyMagnification(null);
        this.updateVisibility();
    }

    /** The dock icon of `app`, where the genie effect pours its windows. */
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
        this.edge.destroy();
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
        const [, width] = this.dash.get_preferred_width(-1);
        const [, height] = this.dash.get_preferred_height(width);
        this.dash.set_position(0, 0);
        this.background.set_position(0, 0);
        this.background.set_size(width, height);
        this.hitArea.set_size(width, height + MARGIN);
        this.divider.height = this.options.iconSize * 0.7;
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = Math.round(monitor.y + monitor.height - height - MARGIN);
        this.actor.set_position(x, y);
        this.edge.set_position(x, monitor.y + monitor.height - 1);
        this.edge.width = width;
        this.updateVisibility();
    }

    /** Where the dock sits when shown, in stage coordinates. */
    private restingRect(): Rect {
        const [x, y] = [this.actor.x, this.actor.y];
        return { x, y, width: this.background.width, height: this.background.height };
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
        const dock = this.restingRect();
        const workspace = global.workspace_manager.get_active_workspace();
        return global
            .get_window_actors()
            .map((actor) => actor.meta_window)
            .some(
                (window) =>
                    !window.minimized &&
                    window.showing_on_its_workspace() &&
                    window.located_on_workspace(workspace) &&
                    window.get_monitor() === this.monitorIndex &&
                    [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(window.get_window_type()) &&
                    overlaps(dock, window.get_frame_rect()),
            );
    }

    /** The pointer is over the dock or the strip below it down to the screen edge. */
    private pointerOnDock(): boolean {
        if (this.actor.hover) return true;
        const [px, py] = global.get_pointer();
        const { x, y, width, height } = this.restingRect();
        return px >= x && px < x + width && py >= y && py < y + height + MARGIN;
    }

    private updateVisibility(): void {
        if (Main.overview.visible || !this.options.autohide || this.pointerOnDock() || this.dragging) {
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
        this.actor.ease({
            translation_y: hidden ? this.background.height + MARGIN + 4 : 0,
            duration: SLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.edge.visible = hidden;
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
            const [x] = event.get_coords();
            this.applyMagnification(x);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /** Magnifies the icons around stage x `pointer`, or puts them back with null. */
    applyMagnification(pointer: number | null): void {
        const items = this.rowItems();
        if (items.length === 0) return;
        const centers = items.map((item) => this.restingCenter(item));
        const fixed = items.map((item) => item === this.divider || item === this.dash._separator || !(item as { child?: unknown }).child);
        const width = this.dash._showAppsIcon.width || this.options.iconSize + 12;
        const m = magnify(centers, width, pointer, { ...MAGNIFY, fixed });
        const easing = pointer === null ? { duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD } : { duration: 0 };
        items.forEach((item, i) => {
            item.remove_transition('translation_x');
            if (easing.duration) item.ease({ translation_x: 0, ...easing });
            else item.translation_x = m.shifts[i];
            const child = (item as { child?: Clutter.Actor | null }).child;
            if (child && !fixed[i]) {
                if (easing.duration) child.ease({ scale_x: 1, scale_y: 1, ...easing });
                else child.set_scale(m.scales[i], m.scales[i]);
            }
        });
        if (easing.duration) {
            this.background.ease({ translation_x: 0, ...easing });
            this.background.ease({ width: this.dashWidth(), ...easing });
        } else {
            this.background.translation_x = -m.extraLeft;
            this.background.width = this.dashWidth() + m.extra;
        }
    }

    private dashWidth(): number {
        return this.dash.get_preferred_width(-1)[1];
    }

    private rowItems(): Clutter.Actor[] {
        return [...this.dash.rowItems(), this.divider, this.trash].filter((item) => item.visible);
    }

    /** Centre of `item` without its magnification shift, in stage x. */
    private restingCenter(item: Clutter.Actor): number {
        const parent = item.get_parent();
        const [parentX] = parent ? parent.get_transformed_position() : [0];
        const box = item.get_allocation_box();
        return (parentX ?? 0) + box.x1 + (box.x2 - box.x1) / 2;
    }
}
