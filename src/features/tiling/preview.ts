import Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import type { Rect } from '../../shared/logic/geometry.js';
import { isLight } from '../../shared/scheme.js';

const MOVE = 200;
const FADE = 150;

/**
 * The macOS tile preview: a frosted, translucent rounded rect below the
 * dragged window that eases to where the window will go when dropped.
 */
export class TilePreview {
    private actor: St.Widget | null = null;
    private showing = false;

    open(window: Meta.Window, target: Rect): void {
        const actor = this.actor ?? this.create();
        actor.style_class = isLight() ? 'macr-tile-preview macr-light' : 'macr-tile-preview';
        const windowActor = window.get_compositor_private() as Clutter.Actor | null;
        if (windowActor?.get_parent() === global.window_group) global.window_group.set_child_below_sibling(actor, windowActor);
        if (!this.showing) {
            // Grow out of the window itself, as macOS does.
            const frame = window.get_frame_rect();
            actor.set_position(frame.x, frame.y);
            actor.set_size(frame.width, frame.height);
            actor.opacity = 0;
            actor.show();
            this.showing = true;
        }
        actor.ease({ ...target, opacity: 255, duration: MOVE, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    close(): void {
        const actor = this.actor;
        if (!actor || !this.showing) return;
        this.showing = false;
        actor.ease({
            opacity: 0,
            duration: FADE,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (!this.showing) actor.hide();
            },
        });
    }

    destroy(): void {
        this.actor?.destroy();
        this.actor = null;
        this.showing = false;
    }

    private create(): St.Widget {
        const actor = new St.Widget({ style_class: 'macr-tile-preview', visible: false });
        actor.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 30, brightness: 1 }));
        global.window_group.add_child(actor);
        this.actor = actor;
        return actor;
    }
}
