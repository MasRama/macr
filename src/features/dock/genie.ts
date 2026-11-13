import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { adjustAnimationTime } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Rect } from '../../shared/logic/geometry.js';
import type { DockEdge } from './logic/edge.js';
import { genieVertexToward } from './logic/genie.js';

const DURATION = 480;
const EFFECT_NAME = 'macr-genie';
const ANIMATED_TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.MODAL_DIALOG, Meta.WindowType.DIALOG];

type ShellWM = Shell.WM & { connect(signal: string, callback: (wm: Shell.WM, actor: Meta.WindowActor) => void): number };
type PrivateWM = {
    _shouldAnimateActor(actor: Meta.WindowActor, types: Meta.WindowType[]): boolean;
    _minimizeWindow(shellwm: Shell.WM, actor: Meta.WindowActor): void;
    _unminimizeWindow(shellwm: Shell.WM, actor: Meta.WindowActor): void;
};

/** Bends a window's texture along the genie curve. */
const GenieEffect = GObject.registerClass(
    class GenieEffect extends Clutter.DeformEffect {
        progress!: number;
        /** The icon, in the window's coordinates. */
        icon!: Rect;
        private size!: { width: number; height: number };
        private edge!: DockEdge;

        constructor(icon: Rect, size: { width: number; height: number }, edge: DockEdge) {
            super();
            this.icon = icon;
            this.size = size;
            this.edge = edge;
            this.progress = 0;
            this.set_n_tiles(12, 32);
        }

        override vfunc_deform_vertex(width: number, height: number, vertex: { x: number; y: number; tx: number; ty: number }): void {
            const [x, y] = genieVertexToward(this.edge, vertex.tx * this.size.width, vertex.ty * this.size.height, this.size, this.icon, this.progress);
            vertex.x = (x * width) / this.size.width;
            vertex.y = (y * height) / this.size.height;
        }

        // The bent window paints outside its own box: redraw the whole stage.
        override vfunc_modify_paint_volume(): boolean {
            return false;
        }
    },
);

type GenieEffect = InstanceType<typeof GenieEffect>;

interface Running {
    timeline: Clutter.Timeline;
    effect: GenieEffect;
    done: () => void;
    /** Stops waiting for the icon to get its place, while it does. */
    unwait: (() => void) | null;
    /** Stops following the icon. */
    forget: () => void;
}

/** How long to wait for an icon the dock just added (a thumbnail) to get its place. */
const PLACE_WAIT = 200;

/**
 * The genie minimize: replaces GNOME's minimize and unminimize animations
 * with a window pouring into (and out of) its dock icon. GNOME's own
 * handlers are blocked while it is on and its animation still plays when
 * a window has no icon in the dock.
 */
export class Genie {
    private readonly wm = global.window_manager as ShellWM;
    private readonly blocked: number[] = [];
    private readonly ids: number[] = [];
    private readonly running = new Map<Meta.WindowActor, Running>();

    constructor(
        private readonly iconOf: (app: Shell.App, window: Meta.Window) => Clutter.Actor | null,
        private readonly edge: () => DockEdge,
    ) {
        const found = ['minimize', 'unminimize'].map((signalId) =>
            (GObject.signal_handler_find as unknown as (instance: object, match: { signalId: string }) => unknown)(this.wm, { signalId }),
        );
        // GNOME Shell connects them at startup, before any extension.
        if (!found.every((id) => typeof id === 'number' && id > 0)) return;
        for (const id of found as number[]) {
            GObject.signal_handler_block(this.wm, id);
            this.blocked.push(id);
        }
        this.ids.push(this.wm.connect('minimize', (_wm, actor) => this.minimize(actor)));
        this.ids.push(this.wm.connect('unminimize', (_wm, actor) => this.unminimize(actor)));
        this.ids.push(this.wm.connect('kill-window-effects', (_wm, actor) => this.finish(actor)));
    }

    destroy(): void {
        for (const actor of [...this.running.keys()]) this.finish(actor);
        for (const id of this.ids) this.wm.disconnect(id);
        for (const id of this.blocked) GObject.signal_handler_unblock(this.wm, id);
        this.ids.length = 0;
        this.blocked.length = 0;
    }

    private get gnome(): PrivateWM {
        return Main.wm as unknown as PrivateWM;
    }

    private target(actor: Meta.WindowActor): Clutter.Actor | null {
        if (actor.meta_window.is_monitor_sized()) return null;
        const app = Shell.WindowTracker.get_default().get_window_app(actor.meta_window);
        const icon = app ? this.iconOf(app, actor.meta_window) : null;
        return icon?.mapped ? icon : null;
    }

    private minimize(actor: Meta.WindowActor): void {
        const icon = this.target(actor);
        if (!icon) {
            this.gnome._minimizeWindow(this.wm, actor);
            return;
        }
        if (!this.gnome._shouldAnimateActor(actor, ANIMATED_TYPES)) {
            this.wm.completed_minimize(actor);
            return;
        }
        this.play(actor, icon, false, () => this.wm.completed_minimize(actor));
    }

    private unminimize(actor: Meta.WindowActor): void {
        const icon = this.target(actor);
        if (!icon) {
            this.gnome._unminimizeWindow(this.wm, actor);
            return;
        }
        if (!this.gnome._shouldAnimateActor(actor, ANIMATED_TYPES)) {
            this.wm.completed_unminimize(actor);
            return;
        }
        this.play(actor, icon, true, () => this.wm.completed_unminimize(actor));
    }

    /** Where `icon` is now, in the coordinates of a window whose buffer is at `rect`; null while it has no place. */
    private iconRect(icon: Clutter.Actor, rect: Rect): Rect | null {
        if (!icon.get_stage() || !icon.has_allocation()) return null;
        const [x, y] = icon.get_transformed_position();
        const [width, height] = icon.get_transformed_size();
        if (!width || !height) return null;
        return { x: (x ?? 0) - rect.x, y: (y ?? 0) - rect.y, width, height };
    }

    private play(actor: Meta.WindowActor, icon: Clutter.Actor, reverse: boolean, done: () => void): void {
        const buffer = actor.meta_window.get_buffer_rect();
        const rect = { x: buffer.x, y: buffer.y, width: buffer.width, height: buffer.height };
        const edge = this.edge();
        // Until the icon has its place: the middle of the window's dock side.
        const fallback = {
            bottom: { x: rect.width / 2, y: rect.height, width: 0, height: 0 },
            left: { x: 0, y: rect.height / 2, width: 0, height: 0 },
            right: { x: rect.width, y: rect.height / 2, width: 0, height: 0 },
        }[edge];
        const effect = new GenieEffect(this.iconRect(icon, rect) ?? fallback, { width: actor.width, height: actor.height }, edge);
        actor.add_effect_with_name(EFFECT_NAME, effect);

        const timeline = new Clutter.Timeline({ actor, duration: adjustAnimationTime(DURATION) });
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_IN_OUT_SINE);
        // A thumbnail leaves the dock as its window comes back out of it.
        let target: Clutter.Actor | null = icon;
        const step = (): void => {
            // The dock moves while its row changes: follow the icon.
            if (target) effect.icon = this.iconRect(target, rect) ?? effect.icon;
            const t = timeline.get_progress();
            const progress = reverse ? 1 - t : t;
            effect.progress = progress;
            actor.opacity = Math.round(255 * (1 - Math.max(0, (progress - 0.85) / 0.15)));
            effect.invalidate();
        };
        timeline.connect('new-frame', step);
        timeline.connect('completed', () => this.finish(actor));
        const goneId = icon.connect('destroy', () => {
            target = null;
            if (!running.unwait) return;
            running.unwait();
            timeline.start();
        });
        const running: Running = {
            timeline,
            effect,
            done,
            unwait: null,
            forget: () => {
                if (target) icon.disconnect(goneId);
                target = null;
            },
        };
        this.running.set(actor, running);
        if (reverse) {
            actor.set_position(rect.x, rect.y);
            effect.progress = 1;
            actor.opacity = 0;
            actor.show();
        }
        if (icon.has_allocation()) {
            timeline.start();
            return;
        }
        // A thumbnail the dock just added has no place yet.
        const start = () => {
            running.unwait?.();
            if (target) effect.icon = this.iconRect(target, rect) ?? effect.icon;
            timeline.start();
        };
        const allocationId = icon.connect('notify::allocation', start);
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PLACE_WAIT, () => {
            timeoutId = 0;
            start();
            return GLib.SOURCE_REMOVE;
        });
        running.unwait = () => {
            running.unwait = null;
            icon.disconnect(allocationId);
            if (timeoutId) GLib.source_remove(timeoutId);
            timeoutId = 0;
        };
    }

    private finish(actor: Meta.WindowActor): void {
        const running = this.running.get(actor);
        if (!running) return;
        this.running.delete(actor);
        running.unwait?.();
        running.forget();
        running.timeline.stop();
        actor.remove_effect(running.effect);
        actor.opacity = 255;
        running.done();
    }
}
