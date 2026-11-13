import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Arrangement } from '../../shared/logic/arrange.js';
import type { Placement } from '../../shared/logic/geometry.js';
import type { Module } from '../../shared/module.js';
import { Tiler } from '../../shared/tiler.js';
import { setTiler } from '../../shared/tiling-link.js';
import { DragSnap } from './drag.js';
import { sameList, withoutClashes } from './logic/keys.js';

/** The margin tiles keep with `tiling-margins` on, in pixels. */
const GAP = 8;
const SAVED_EDGE_TILING = 'tiling-saved-edge-tiling';
const SAVED_TOGGLE_TILED = 'tiling-saved-toggle-tiled';
/** GNOME's own half tiling keys; Zorin binds Super+Ctrl+Left/Right there too. */
const TOGGLE_TILED = ['toggle-tiled-left', 'toggle-tiled-right'];

/** Each shortcut's setting and what it does to the focused window. */
export const PLACEMENT_KEYS: [string, Placement][] = [
    ['tiling-left', 'left'],
    ['tiling-right', 'right'],
    ['tiling-top', 'top'],
    ['tiling-bottom', 'bottom'],
    ['tiling-top-left', 'top-left'],
    ['tiling-top-right', 'top-right'],
    ['tiling-bottom-left', 'bottom-left'],
    ['tiling-bottom-right', 'bottom-right'],
    ['tiling-fill', 'fill'],
    ['tiling-center', 'center'],
];
export const ARRANGE_KEYS: [string, Arrangement][] = [
    ['tiling-arrange-left-right', 'left-right'],
    ['tiling-arrange-right-left', 'right-left'],
    ['tiling-arrange-top-bottom', 'top-bottom'],
    ['tiling-arrange-bottom-top', 'bottom-top'],
];
const RETURN_KEY = 'tiling-return';
const SHORTCUT_KEYS = [...PLACEMENT_KEYS.map(([key]) => key), ...ARRANGE_KEYS.map(([key]) => key), RETURN_KEY];

/**
 * macOS window tiling: drag a window to a screen edge or corner, or use
 * Super+Ctrl and the arrow keys, F, C and R. GNOME's own edge tiling is off
 * while it runs, and its half-tiling keys give up the Super+Ctrl combos Macr
 * uses; both are put back on disable unless the user changed them since.
 */
export class TilingModule implements Module {
    private readonly mutter = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
    private readonly mutterKeys = new Gio.Settings({ schema_id: 'org.gnome.mutter.keybindings' });
    private tiler: Tiler | null = null;
    private drag: DragSnap | null = null;
    /** Macr's accelerators when the GNOME keys were changed. */
    private ours: string[] = [];

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.takeEdgeTiling();
        this.takeToggleTiled();
        const tiler = new Tiler(() => (this.settings.get_boolean('tiling-margins') ? GAP : 0));
        this.tiler = tiler;
        setTiler(tiler);
        this.drag = new DragSnap(tiler);

        const focused = () => global.display.get_focus_window();
        const bind = (key: string, action: (window: Meta.Window) => void) =>
            Main.wm.addKeybinding(key, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () => {
                const window = focused();
                if (window) action(window);
            });
        for (const [key, placement] of PLACEMENT_KEYS) bind(key, (window) => tiler.place(window, placement));
        for (const [key, kind] of ARRANGE_KEYS) bind(key, (window) => tiler.arrange(window, kind));
        bind(RETURN_KEY, (window) => tiler.returnToPrevious(window));
    }

    disable(): void {
        for (const key of SHORTCUT_KEYS) Main.wm.removeKeybinding(key);
        this.drag?.destroy();
        this.drag = null;
        setTiler(null);
        this.tiler?.destroy();
        this.tiler = null;
        this.giveBackToggleTiled();
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

    /**
     * Takes Macr's accelerators out of GNOME's half-tiling keys (only those:
     * Super+Left/Right keep working), saving the user's lists. A list saved
     * before, by a session that ended without disable, is the one kept.
     */
    private takeToggleTiled(): void {
        this.ours = SHORTCUT_KEYS.flatMap((key) => this.settings.get_strv(key));
        const saved = this.saved();
        for (const key of TOGGLE_TILED) {
            const original = saved[key] ?? this.mutterKeys.get_strv(key);
            const wanted = withoutClashes(original, this.ours);
            if (sameList(wanted, original)) {
                delete saved[key];
                continue;
            }
            saved[key] = original;
            if (!sameList(this.mutterKeys.get_strv(key), wanted)) this.mutterKeys.set_strv(key, wanted);
        }
        this.save(saved);
    }

    private giveBackToggleTiled(): void {
        for (const [key, original] of Object.entries(this.saved())) {
            if (!TOGGLE_TILED.includes(key)) continue;
            // Only if it is still what Macr made it.
            if (sameList(this.mutterKeys.get_strv(key), withoutClashes(original, this.ours))) this.mutterKeys.set_strv(key, original);
        }
        this.save({});
    }

    private saved(): Record<string, string[]> {
        return this.settings.get_value(SAVED_TOGGLE_TILED).deepUnpack() as Record<string, string[]>;
    }

    private save(saved: Record<string, string[]>): void {
        this.settings.set_value(SAVED_TOGGLE_TILED, new GLib.Variant('a{sas}', saved));
    }
}
