import GLib from 'gi://GLib';
import type St from 'gi://St';

/**
 * How long the pointer rests on a screen edge that another monitor shares
 * before it counts: the pointer only passing through to that monitor does not.
 */
const SHARED_DWELL = 300;

/**
 * Calls `reached` when the pointer reaches a one-pixel edge actor (one that
 * tracks hover): at once on an edge of the whole screen, or after a short
 * rest on an edge another monitor shares (`shared`). Calls `left` when it
 * leaves the edge again, so what it brought out can go back if the pointer
 * moved away rather than onto it.
 */
export class EdgeHover {
    private readonly hoverId: number;
    private timeout = 0;

    constructor(
        private readonly edge: St.Widget,
        private readonly shared: () => boolean,
        private readonly reached: () => void,
        private readonly left: () => void,
    ) {
        this.hoverId = edge.connect('notify::hover', () => this.sync());
    }

    destroy(): void {
        this.cancel();
        this.edge.disconnect(this.hoverId);
    }

    private sync(): void {
        this.cancel();
        if (!this.edge.hover) {
            this.left();
            return;
        }
        if (!this.shared()) {
            this.reached();
            return;
        }
        this.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHARED_DWELL, () => {
            this.timeout = 0;
            if (this.edge.hover) this.reached();
            return GLib.SOURCE_REMOVE;
        });
    }

    private cancel(): void {
        if (!this.timeout) return;
        GLib.source_remove(this.timeout);
        this.timeout = 0;
    }
}
