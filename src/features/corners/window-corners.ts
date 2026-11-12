import type Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { CornerEffect } from './effect.js';
import { cornerPlan, type WindowShape } from './logic/plan.js';

const EFFECT = 'macr-corners';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };

/** One window Macr watches, with what it added to it. */
interface Tracked {
    effect: CornerEffect;
    /** The actor that holds the effect: the window's contents. */
    target: Clutter.Actor | null;
    shadow: St.Widget | null;
    ids: [Signals, number][];
}

/**
 * macOS window corners: every window that does not shape its own corners is
 * cut to a rounded rectangle by a shader on its contents, and a frameless one
 * gets a soft shadow behind it. Maximized, tiled and full-screen windows keep
 * square corners. Everything is taken off on destroy.
 */
export class WindowCorners {
    private readonly tracked = new Map<Meta.WindowActor, Tracked>();
    private readonly ids: [Signals, number][] = [];

    constructor(private readonly settings: Gio.Settings) {
        for (const actor of global.get_window_actors()) this.track(actor);
        this.connect(this.ids, global.window_manager, 'map', (_wm: unknown, actor: Meta.WindowActor) => this.track(actor));
        this.connect(this.ids, global.display, 'restacked', () => this.restack());
        this.connect(this.ids, this.settings, 'changed::window-corner-radius', () => {
            for (const actor of this.tracked.keys()) this.update(actor);
        });
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        for (const actor of [...this.tracked.keys()]) this.untrack(actor);
    }

    private connect(list: [Signals, number][], object: object, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        list.push([target, target.connect(signal, callback)]);
    }

    private track(actor: Meta.WindowActor): void {
        if (this.tracked.has(actor)) return;
        const window = actor.meta_window;
        const entry: Tracked = { effect: new CornerEffect(), target: null, shadow: null, ids: [] };
        this.tracked.set(actor, entry);
        const update = () => this.update(actor);
        this.connect(entry.ids, actor, 'notify::allocation', update);
        this.connect(entry.ids, actor, 'notify::pivot-point', update);
        this.connect(entry.ids, window, 'size-changed', update);
        this.connect(entry.ids, window, 'notify::maximized-horizontally', update);
        this.connect(entry.ids, window, 'notify::maximized-vertically', update);
        this.connect(entry.ids, window, 'notify::fullscreen', update);
        this.connect(entry.ids, actor, 'destroy', () => this.untrack(actor));
        update();
    }

    private untrack(actor: Meta.WindowActor): void {
        const entry = this.tracked.get(actor);
        if (!entry) return;
        this.tracked.delete(actor);
        for (const [object, id] of entry.ids) object.disconnect(id);
        entry.target?.remove_effect(entry.effect);
        entry.shadow?.destroy();
    }

    private update(actor: Meta.WindowActor): void {
        const entry = this.tracked.get(actor);
        if (!entry) return;
        const window = actor.meta_window;
        const plan = cornerPlan(shapeOf(window), this.settings.get_int('window-corner-radius'));

        const target = actor.get_first_child() as Clutter.Actor | null;
        if (entry.target && (entry.target !== target || !plan.round)) {
            entry.target.remove_effect(entry.effect);
            entry.target = null;
        }
        if (plan.round && target) {
            if (!entry.target) {
                target.add_effect_with_name(EFFECT, entry.effect);
                entry.target = target;
            }
            entry.effect.setShape(plan.bounds, plan.radius, target.width, target.height);
        }

        if (plan.round && plan.shadow) this.placeShadow(actor, entry, plan.bounds, plan.radius);
        else {
            entry.shadow?.destroy();
            entry.shadow = null;
        }
    }

    private placeShadow(actor: Meta.WindowActor, entry: Tracked, bounds: [number, number, number, number], radius: number): void {
        if (!entry.shadow) {
            const shadow = new St.Widget({ style_class: 'macr-window-shadow' });
            // The shadow follows the window through GNOME's open, close and
            // minimize animations, which fade, scale and slide the window.
            for (const property of ['visible', 'opacity', 'scale-x', 'scale-y', 'translation-x', 'translation-y'])
                actor.bind_property(property, shadow, property, GObject.BindingFlags.SYNC_CREATE);
            global.window_group.insert_child_below(shadow, actor);
            entry.shadow = shadow;
        }
        const [x1, y1, x2, y2] = bounds;
        entry.shadow.set_position(actor.x + x1, actor.y + y1);
        entry.shadow.set_size(x2 - x1, y2 - y1);
        // Scale around the same point as the window.
        const [px, py] = actor.get_pivot_point();
        entry.shadow.set_pivot_point((px * actor.width - x1) / (x2 - x1), (py * actor.height - y1) / (y2 - y1));
        entry.shadow.set_style(`border-radius: ${radius}px;`);
    }

    private restack(): void {
        for (const [actor, entry] of this.tracked) {
            if (entry.shadow && actor.get_parent() === global.window_group)
                global.window_group.set_child_below_sibling(entry.shadow, actor);
        }
    }
}

function shapeOf(window: Meta.Window): WindowShape {
    const type = window.get_window_type();
    const kind = type === Meta.WindowType.NORMAL ? 'normal'
        : type === Meta.WindowType.DIALOG || type === Meta.WindowType.MODAL_DIALOG ? 'dialog' : 'other';
    return {
        kind,
        buffer: window.get_buffer_rect(),
        frame: window.get_frame_rect(),
        serverDecorated: window.decorated && !window.is_client_decorated(),
        maximized: window.get_maximized() !== 0,
        fullscreen: window.fullscreen,
    };
}
