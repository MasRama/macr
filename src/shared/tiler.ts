import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import { arrangePartner, arrangement, type Arrangement } from './logic/arrange.js';
import { placeWindow, reanchor, sameRect, type Placement, type Rect } from './logic/geometry.js';
import { tileState, updateTileState } from './tiling-store.js';

/** How long a window has to settle after a placement before its size is checked. */
const SETTLE = 250;
/** Stop watching a placed window after this long. */
const WATCH = 2000;

type Signals = { disconnect(id: number): void };

interface Watch {
    ids: number[];
    settle: number;
    timeout: number;
}

export function rectOf(rect: { x: number; y: number; width: number; height: number }): Rect {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Puts windows in halves, quarters, Fill and Center, arranges two side by
 * side and gives them back their size, remembering what it did in the
 * tiling store. `gap` is the margin tiles keep (0 without margins).
 */
export class Tiler {
    private readonly watches = new Map<Meta.Window, Watch>();

    constructor(private readonly gap: () => number) {}

    destroy(): void {
        for (const window of [...this.watches.keys()]) this.unwatch(window);
    }

    /** Normal windows the user can move (and, but for Center, resize). */
    canPlace(window: Meta.Window | null, placement?: Placement): window is Meta.Window {
        if (!window || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_attached_dialog()) return false;
        if (!window.allows_move()) return false;
        return placement === 'center' || window.allows_resize();
    }

    /** Still in the tile Macr gave it. */
    isTiled(window: Meta.Window): boolean {
        const tile = tileState(window)?.tile;
        return !!tile && sameRect(rectOf(window.get_frame_rect()), tile);
    }

    /** The frame `placement` gives `window` on `monitor`. */
    target(window: Meta.Window, placement: Placement, monitor = window.get_monitor()): Rect {
        const area = rectOf(window.get_work_area_for_monitor(monitor));
        return placeWindow(placement, area, this.size(window), this.gap());
    }

    place(window: Meta.Window, placement: Placement, monitor = window.get_monitor()): void {
        if (!this.canPlace(window, placement)) return;
        const frame = rectOf(window.get_frame_rect());
        // A maximized or full-screen window has no size of its own to go back to.
        if (!this.isTiled(window) && !window.get_maximized() && !window.is_fullscreen())
            updateTileState(window, { restore: frame });
        const target = this.target(window, placement, monitor);

        if (window.is_fullscreen()) window.unmake_fullscreen();
        if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH);
        if (monitor !== window.get_monitor()) window.move_to_monitor(monitor);
        window.move_resize_frame(true, target.x, target.y, target.width, target.height);
        updateTileState(window, { tile: target, placement });
        this.watch(window, placement, target, rectOf(window.get_work_area_for_monitor(monitor)));
    }

    /** The other window `arrange` would use, if any. */
    partner(window: Meta.Window): Meta.Window | null {
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, window.get_workspace());
        const id = arrangePartner(windows.map((w) => ({
            id: w.get_id(),
            monitor: w.get_monitor(),
            minimized: w.minimized,
            tileable: this.canPlace(w),
        })), window.get_id());
        return windows.find((w) => w.get_id() === id) ?? null;
    }

    /** Tiles `window` and the window used before it side by side (or one above the other). */
    arrange(window: Meta.Window, kind: Arrangement): void {
        if (!this.canPlace(window)) return;
        const [first, second] = arrangement(kind);
        const monitor = window.get_monitor();
        const partner = this.partner(window);
        this.place(window, first, monitor);
        if (!partner) return;
        this.place(partner, second, monitor);
        partner.raise();
        window.raise();
    }

    canReturn(window: Meta.Window | null): window is Meta.Window {
        const restore = window && tileState(window)?.restore;
        return !!restore && !sameRect(rectOf(window.get_frame_rect()), restore);
    }

    /** Return to Previous Size: the frame the window had before it was tiled. */
    returnToPrevious(window: Meta.Window): void {
        const restore = tileState(window)?.restore;
        if (!restore || !window.allows_move()) return;
        this.unwatch(window);
        if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH);
        window.move_resize_frame(true, restore.x, restore.y, restore.width, restore.height);
        updateTileState(window, { restore: null, tile: null, placement: null });
    }

    /** Forgets the tile of a window that was moved or resized out of it by hand. */
    settle(window: Meta.Window): void {
        if (tileState(window)?.tile && !this.isTiled(window)) updateTileState(window, { tile: null, placement: null });
    }

    /** The size Center keeps: the window's own, or the one it had before it was maximized. */
    private size(window: Meta.Window): Rect {
        const restore = tileState(window)?.restore;
        if (window.get_maximized() && restore) return restore;
        return rectOf(window.get_frame_rect());
    }

    /**
     * Wayland clients resize in their own time and may refuse to get smaller
     * than their minimum size. Once the window settles, one that stayed
     * bigger than its tile is moved back against the tile's outer edges, and
     * the tile becomes the frame it really has.
     */
    private watch(window: Meta.Window, placement: Placement, target: Rect, area: Rect): void {
        this.unwatch(window);
        const watch: Watch = { ids: [], settle: 0, timeout: 0 };
        const check = () => {
            watch.settle = 0;
            const frame = rectOf(window.get_frame_rect());
            if (frame.width > target.width + 1 || frame.height > target.height + 1) {
                const fixed = reanchor(placement, target, frame, area);
                window.move_frame(true, fixed.x, fixed.y);
                updateTileState(window, { tile: fixed });
                this.unwatch(window);
            } else {
                updateTileState(window, { tile: frame });
            }
            return GLib.SOURCE_REMOVE;
        };
        const restart = () => {
            if (watch.settle) GLib.source_remove(watch.settle);
            watch.settle = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE, check);
        };
        watch.ids.push(window.connect('size-changed', restart), window.connect('position-changed', restart));
        watch.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WATCH, () => {
            watch.timeout = 0;
            this.unwatch(window);
            return GLib.SOURCE_REMOVE;
        });
        this.watches.set(window, watch);
        restart();
    }

    private unwatch(window: Meta.Window): void {
        const watch = this.watches.get(window);
        if (!watch) return;
        for (const id of watch.ids) (window as Signals).disconnect(id);
        if (watch.settle) GLib.source_remove(watch.settle);
        if (watch.timeout) GLib.source_remove(watch.timeout);
        this.watches.delete(window);
    }
}
