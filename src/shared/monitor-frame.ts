import type Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Rect } from './logic/geometry.js';

/**
 * A chrome actor the size of one monitor that clips what it holds, as the
 * screen's border would: chrome sliding past the monitor's edge (a hidden
 * dock, the Stage Manager strip, a leaving screenshot thumbnail) is cut off
 * there instead of showing, and taking clicks, on the monitor next to it.
 * The frame itself takes no input; what it holds does where it shows.
 */
export class MonitorFrame {
    readonly actor: St.Widget;

    /** `top` puts it over full-screen windows; `trackFullscreen` hides it under them. */
    constructor(name: string, options: { top?: boolean; trackFullscreen?: boolean } = {}) {
        this.actor = new St.Widget({ name, clip_to_allocation: true });
        if (options.top) Main.layoutManager.addTopChrome(this.actor, { affectsInputRegion: false });
        else Main.layoutManager.addChrome(this.actor, { affectsInputRegion: false, trackFullscreen: options.trackFullscreen ?? false });
    }

    /** Adds `child`, placed in the frame's coordinates (the monitor's top left is 0, 0). */
    add(child: Clutter.Actor): void {
        this.actor.add_child(child);
        Main.layoutManager.trackChrome(child, { affectsInputRegion: true, trackFullscreen: false });
    }

    /** Covers the monitor at `rect` (stage coordinates). */
    place(rect: Rect): void {
        this.actor.set_position(rect.x, rect.y);
        this.actor.set_size(rect.width, rect.height);
    }

    /** Goes, with what it holds. */
    destroy(): void {
        this.actor.destroy();
    }
}
