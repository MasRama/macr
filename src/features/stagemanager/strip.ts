import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { windowCovers } from '../../shared/covered.js';
import type { Rect } from '../../shared/logic/geometry.js';
import { isLight } from '../../shared/scheme.js';
import { fitPreview, stripLayout } from './logic/slots.js';

/** How far the thumbnails turn away from the viewer, in degrees. */
const TILT = 22;
const HOVER_TILT = 6;
const ICON_SIZE = 32;
const HIDE_DELAY = 400;
const SLIDE_TIME = 220;
const HOVER_TIME = 160;

type Signals = { connect(signal: string, callback: (...args: never[]) => unknown): number; disconnect(id: number): void };

export interface StripStage {
    app: Shell.App;
    /** Most recent first. */
    windows: Meta.Window[];
}

/** One stage: a tilted thumbnail of up to three of the app's windows, with its icon. */
class StageView {
    readonly button: St.Button;
    private readonly card: St.Widget;
    private readonly shadow: St.Widget;
    private readonly preview: Clutter.Actor;
    private readonly layout: Shell.WindowPreviewLayout;
    private readonly icon: St.Bin;
    private readonly boxId: number;

    constructor(
        stage: StripStage,
        private readonly slot: Rect,
        onSelect: (app: string) => void,
    ) {
        // The slot's size, so St.Button does not centre a narrower thumbnail.
        const content = new St.Widget({ width: slot.width, height: slot.height, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START });
        this.button = new St.Button({
            style_class: 'macr-stage',
            reactive: true,
            track_hover: true,
            can_focus: false,
            x: slot.x,
            y: slot.y,
            width: slot.width,
            height: slot.height,
            child: content,
        });
        this.button.accessible_name = stage.app.get_name();
        this.card = new St.Widget({ style_class: 'macr-stage-card', pivot_point: new Graphene.Point({ x: 0, y: 0.5 }) });
        this.card.rotation_angle_y = TILT;
        this.shadow = new St.Widget({ style_class: 'macr-stage-shadow' });
        // GJS cannot take a layout manager that tracks its container at construction.
        this.preview = new Clutter.Actor();
        this.layout = new Shell.WindowPreviewLayout();
        this.preview.layout_manager = this.layout;
        // The most recent window on top.
        for (const window of [...stage.windows].reverse()) this.layout.add_window(window);
        this.card.add_child(this.shadow);
        this.card.add_child(this.preview);
        content.add_child(this.card);

        this.icon = new St.Bin({ style_class: 'macr-stage-icon', child: stage.app.create_icon_texture(ICON_SIZE) });
        content.add_child(this.icon);

        this.boxId = this.layout.connect('notify::bounding-box', () => this.place());
        this.button.connect('notify::hover', () => this.onHover());
        this.button.connect('clicked', () => onSelect(stage.app.get_id()));
        this.place();
    }

    destroy(): void {
        this.layout.disconnect(this.boxId);
        this.button.destroy();
    }

    private place(): void {
        const box = this.layout.bounding_box;
        const fit = fitPreview({ width: box.get_width(), height: box.get_height() }, { x: 0, y: 0, width: this.slot.width, height: this.slot.height });
        this.card.set_position(fit.x, fit.y);
        this.card.set_size(fit.width, fit.height);
        this.shadow.set_size(fit.width, fit.height);
        this.preview.set_size(fit.width, fit.height);
        // Over the thumbnail's bottom left corner, as on macOS.
        this.icon.set_position(fit.x - Math.round(ICON_SIZE / 3), fit.y + fit.height - Math.round((ICON_SIZE * 2) / 3));
    }

    private onHover(): void {
        const hover = this.button.hover;
        this.card.ease({
            rotation_angle_y: hover ? HOVER_TILT : TILT,
            translation_x: hover ? 6 : 0,
            duration: HOVER_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
}

/**
 * The strip of stages down the left edge of one monitor. It floats
 * over windows (no struts), slides away when a window covers it and comes
 * back when the pointer reaches the screen's left edge. Hidden in Mission
 * Control, over full-screen windows and while paused.
 */
export class Strip {
    private readonly actor: St.Widget;
    private readonly edge: St.Widget;
    private readonly ids: [Signals, number][] = [];
    private focusIds: [Signals, number][] = [];
    private views: StageView[] = [];
    private stages: StripStage[] = [];
    private signature = '';
    private rest: Rect = { x: 0, y: 0, width: 0, height: 0 };
    private paused = false;
    private hidden = false;
    private hideTimeout = 0;

    constructor(
        private readonly monitor: number,
        private readonly onSelect: (app: string) => void,
    ) {
        this.actor = new St.Widget({ name: 'macrStageStrip', style_class: 'macr-stage-strip', reactive: true, track_hover: true, visible: false });
        this.edge = new St.Widget({ name: 'macrStageEdge', reactive: true, track_hover: true, width: 1, visible: false });
        // Not trackFullscreen: the layout manager would set `visible` behind the strip's back.
        Main.layoutManager.addChrome(this.actor, { affectsInputRegion: true });
        Main.layoutManager.addChrome(this.edge, { affectsInputRegion: true });

        this.listen(this.actor, 'notify::hover', () => this.updateVisibility());
        this.listen(this.edge, 'notify::hover', () => {
            if (this.edge.hover) this.reveal();
        });
        this.listen(Main.overview, 'showing', () => this.updateVisibility());
        this.listen(Main.overview, 'hidden', () => this.updateVisibility());
        this.listen(global.display, 'in-fullscreen-changed', () => this.updateVisibility());
        this.listen(global.display, 'restacked', () => this.updateVisibility());
        this.listen(global.display, 'grab-op-end', () => this.updateVisibility());
        this.listen(global.display, 'notify::focus-window', () => this.trackFocusWindow());
        // Stage Manager makes new strips when the monitors change.
        this.listen(global.display, 'workareas-changed', () => this.build());
        this.trackFocusWindow();
    }

    /** How many stages fit on its monitor. */
    capacity(): number {
        return stripLayout(this.area(), 0).capacity;
    }

    update(stages: StripStage[]): void {
        const signature = stages.map((s) => `${s.app.get_id()}:${s.windows.map((w) => w.get_id()).join(',')}`).join('|');
        this.stages = stages;
        if (signature !== this.signature) {
            this.signature = signature;
            this.build();
        } else {
            this.updateVisibility();
        }
    }

    /** Paused (the lock screen): hidden until resumed. */
    setPaused(paused: boolean): void {
        this.paused = paused;
        this.updateVisibility();
    }

    destroy(): void {
        this.cancelHide();
        for (const [target, id] of [...this.ids, ...this.focusIds]) target.disconnect(id);
        this.ids.length = 0;
        this.focusIds = [];
        this.clear();
        this.edge.destroy();
        this.actor.destroy();
    }

    private listen(target: unknown, signal: string, callback: (...args: never[]) => unknown): void {
        const object = target as Signals;
        this.ids.push([object, object.connect(signal, callback)]);
    }

    private area(): Rect {
        return Main.layoutManager.getWorkAreaForMonitor(this.monitor);
    }

    private clear(): void {
        for (const view of this.views) view.destroy();
        this.views = [];
    }

    private build(): void {
        this.clear();
        const area = this.area();
        const layout = stripLayout(area, this.stages.length);
        const slots = layout.slots;
        if (slots.length === 0) {
            this.rest = { x: area.x, y: area.y, width: 0, height: 0 };
            this.updateVisibility();
            return;
        }
        // The strip covers the stages plus room for the icons that hang over them.
        const top = slots[0].y - ICON_SIZE / 2;
        const bottom = slots[slots.length - 1].y + slots[slots.length - 1].height + ICON_SIZE / 2;
        this.rest = { x: area.x, y: Math.round(top), width: layout.width, height: Math.round(bottom - top) };
        this.actor.set_position(this.rest.x, this.rest.y);
        this.actor.set_size(this.rest.width, this.rest.height);
        this.edge.set_position(area.x, area.y + 1);
        this.edge.height = Math.max(1, area.height - 2);
        this.views = this.stages.slice(0, slots.length).map((stage, i) => {
            const slot = slots[i];
            const view = new StageView(stage, { ...slot, x: slot.x - this.rest.x, y: slot.y - this.rest.y }, this.onSelect);
            this.actor.add_child(view.button);
            return view;
        });
        this.updateVisibility();
    }

    private trackFocusWindow(): void {
        for (const [target, id] of this.focusIds) target.disconnect(id);
        this.focusIds = [];
        const window = global.display.focus_window;
        if (window) {
            for (const signal of ['position-changed', 'size-changed'])
                this.focusIds.push([window as unknown as Signals, (window as unknown as Signals).connect(signal, () => this.updateVisibility())]);
        }
        this.updateVisibility();
    }

    private suspended(): boolean {
        return this.paused || this.views.length === 0 || Main.overview.visible || Boolean(Main.layoutManager.monitors[this.monitor]?.inFullscreen);
    }

    private covered(): boolean {
        return windowCovers(this.rest, this.monitor);
    }

    private pointerOnStrip(): boolean {
        if (this.actor.hover) return true;
        const [px, py] = global.get_pointer();
        const { x, y, width, height } = this.rest;
        return px >= x && px < x + width && py >= y && py < y + height;
    }

    private updateVisibility(): void {
        if (this.suspended()) {
            this.cancelHide();
            this.actor.hide();
            this.edge.hide();
            return;
        }
        if (!this.actor.visible) {
            this.actor.show();
            this.syncScheme();
        }
        this.edge.visible = this.hidden;
        if (this.pointerOnStrip()) {
            this.cancelHide();
            this.setHidden(false);
        } else if (this.covered()) {
            this.scheduleHide();
        } else {
            this.cancelHide();
            this.setHidden(false);
        }
    }

    private syncScheme(): void {
        if (isLight()) this.actor.add_style_class_name('macr-light');
        else this.actor.remove_style_class_name('macr-light');
    }

    private scheduleHide(): void {
        if (this.hidden || this.hideTimeout) return;
        this.hideTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY, () => {
            this.hideTimeout = 0;
            if (!this.suspended() && !this.pointerOnStrip() && this.covered()) this.setHidden(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    private cancelHide(): void {
        if (!this.hideTimeout) return;
        GLib.source_remove(this.hideTimeout);
        this.hideTimeout = 0;
    }

    private setHidden(hidden: boolean): void {
        this.edge.visible = hidden;
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        if (!hidden) this.syncScheme();
        this.actor.ease({
            translation_x: hidden ? -(this.rest.width + ICON_SIZE) : 0,
            duration: SLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    /** The pointer reached the monitor's left edge: slide in, and away again unless it moves onto the strip. */
    private reveal(): void {
        this.cancelHide();
        this.setHidden(false);
        if (this.covered()) this.scheduleHide();
    }
}
