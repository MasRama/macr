import Gio from 'gi://Gio';

import type { Module } from '../../shared/module.js';
import { Tiler } from '../../shared/tiler.js';
import { setTiler } from '../../shared/tiling-link.js';
import { DragSnap } from './drag.js';

/** The margin tiles keep with `tiling-margins` on, in pixels. */
const GAP = 8;
const SAVED_EDGE_TILING = 'tiling-saved-edge-tiling';

/**
 * macOS window tiling: drag a window to a screen edge or corner. GNOME's own
 * edge tiling is off while it runs and put back on disable unless the user
 * changed it since.
 */
export class TilingModule implements Module {
    private readonly mutter = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
    private tiler: Tiler | null = null;
    private drag: DragSnap | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.takeEdgeTiling();
        const tiler = new Tiler(() => (this.settings.get_boolean('tiling-margins') ? GAP : 0));
        this.tiler = tiler;
        setTiler(tiler);
        this.drag = new DragSnap(tiler);
    }

    disable(): void {
        this.drag?.destroy();
        this.drag = null;
        setTiler(null);
        this.tiler?.destroy();
        this.tiler = null;
        this.giveBackEdgeTiling();
    }

    /** Mutter's edge tiling would show its own preview and tile on drop too. */
    private takeEdgeTiling(): void {
        if (!this.mutter.get_boolean('edge-tiling')) return;
        this.settings.set_boolean(SAVED_EDGE_TILING, true);
        this.mutter.set_boolean('edge-tiling', false);
    }

    private giveBackEdgeTiling(): void {
        if (!this.settings.get_boolean(SAVED_EDGE_TILING)) return;
        if (!this.mutter.get_boolean('edge-tiling')) this.mutter.set_boolean('edge-tiling', true);
        this.settings.set_boolean(SAVED_EDGE_TILING, false);
    }
}
