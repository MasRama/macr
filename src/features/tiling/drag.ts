import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Rect } from '../../shared/logic/geometry.js';
import { rectOf, type Tiler } from '../../shared/tiler.js';
import { tileState, updateTileState } from '../../shared/tiling-store.js';
import { dragOffRect, pulledOff } from './logic/restore.js';
import { snapZone, type Point, type Zone } from './logic/zones.js';
import { TilePreview } from './preview.js';

/** How often the pointer is read during a drag, in milliseconds. */
const POLL = 16;
/** Meta.GrabOp's flag for a move that ignores edge resistance. */
const UNCONSTRAINED = 0x400;

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };

interface Drag {
    window: Meta.Window;
    /** The frame and pointer when the drag began. */
    start: Rect;
    pointer: Point;
    /** The window has left its start position at least once. */
    moved: boolean;
    /** Still in a tile it will leave once pulled. */
    attached: boolean;
    zone: Zone | null;
    poll: number;
}

/**
 * Drag to tile: while a window is dragged with the pointer, a preview shows
 * where it goes at a screen edge or corner, and dropping it there tiles it.
 * A tiled window dragged away gets its old size back under the pointer.
 */
export class DragSnap {
    private readonly ids: [Signals, number][] = [];
    private readonly preview = new TilePreview();
    private drag: Drag | null = null;

    constructor(private readonly tiler: Tiler) {
        const display = global.display as unknown as Signals;
        this.ids.push([display, display.connect('grab-op-begin', (_display: unknown, window: Meta.Window, op: Meta.GrabOp) => this.begin(window, op))]);
        this.ids.push([display, display.connect('grab-op-end', (_display: unknown, window: Meta.Window) => this.end(window))]);
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        this.stop();
        this.preview.destroy();
    }

    private begin(window: Meta.Window, op: Meta.GrabOp): void {
        this.stop();
        // Pointer moves only: keyboard moves and resizes do not snap.
        if ((op & ~UNCONSTRAINED) !== Meta.GrabOp.MOVING || !this.tiler.canPlace(window)) return;
        const [x, y] = global.get_pointer();
        const state = tileState(window);
        this.drag = {
            window,
            start: rectOf(window.get_frame_rect()),
            pointer: { x, y },
            moved: false,
            attached: this.tiler.isTiled(window) && !!state?.restore && state.placement !== 'center',
            zone: null,
            poll: GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL, () => {
                this.update();
                return GLib.SOURCE_CONTINUE;
            }),
        };
    }

    /**
     * Polled rather than driven by the window's position-changed: a window
     * stops at the top of the work area while the pointer goes on into the
     * menu bar, where Fill is.
     */
    private update(): void {
        const drag = this.drag;
        if (!drag) return;
        const [x, y] = global.get_pointer();
        const pointer = { x, y };
        const frame = drag.window.get_frame_rect();
        if (frame.x !== drag.start.x || frame.y !== drag.start.y) drag.moved = true;
        if (drag.attached && pulledOff(drag.pointer, pointer)) {
            drag.attached = false;
            this.dragOff(drag.window, drag.pointer, pointer);
        }

        const zone = snapZone(pointer, Main.layoutManager.monitors);
        if (zone?.monitor === drag.zone?.monitor && zone?.placement === drag.zone?.placement) return;
        drag.zone = zone;
        if (zone) this.preview.open(drag.window, this.tiler.target(drag.window, zone.placement, zone.monitor));
        else this.preview.close();
    }

    private end(window: Meta.Window): void {
        const drag = this.drag;
        if (!drag || drag.window !== window) {
            // A resize, or a move that does not snap: the window may have left its tile.
            this.tiler.settle(window);
            return;
        }
        this.stop();
        const [x, y] = global.get_pointer();
        const zone = snapZone({ x, y }, Main.layoutManager.monitors);
        // Escape puts the window back where it was; there is no other sign of it.
        const frame = window.get_frame_rect();
        const cancelled = drag.moved && frame.x === drag.start.x && frame.y === drag.start.y;
        if (zone && !cancelled) this.tiler.place(window, zone.placement, zone.monitor);
        else this.tiler.settle(window);
    }

    /** Gives a window pulled off its tile its old size, keeping it under the pointer. */
    private dragOff(window: Meta.Window, grab: Point, pointer: Point): void {
        const state = tileState(window);
        if (!state?.restore || !state.tile) return;
        const frame = dragOffRect(grab, pointer, state.tile, state.restore);
        window.move_resize_frame(true, frame.x, frame.y, frame.width, frame.height);
        updateTileState(window, { restore: null, tile: null, placement: null });
    }

    private stop(): void {
        if (this.drag?.poll) GLib.source_remove(this.drag.poll);
        this.drag = null;
        this.preview.close();
    }
}
