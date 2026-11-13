import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { ShakeDetector } from './logic/shake.js';
import { type CursorImage, cursorImages, inheritedThemes, largestImage } from './logic/xcursor.js';

/** How much bigger the pointer gets. */
const GROW = 3;
const GROW_MS = 160;
const SHRINK_MS = 260;
/** How long it stays big after the last shake. */
const HOLD_MS = 900;
const BUTTONS = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK | Clutter.ModifierType.BUTTON3_MASK;

type Easeable = { ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void };

interface Arrow {
    image: CursorImage;
    content: St.ImageContent;
}

/** Where icon themes live, most personal first. */
function iconDirs(): string[] {
    return [
        GLib.build_filenamev([GLib.get_home_dir(), '.icons']),
        GLib.build_filenamev([GLib.get_user_data_dir(), 'icons']),
        ...GLib.get_system_data_dirs().map((dir) => GLib.build_filenamev([dir, 'icons'])),
        '/usr/share/pixmaps',
    ];
}

function readFile(path: string): Uint8Array | null {
    try {
        const [ok, data] = GLib.file_get_contents(path);
        return ok ? data : null;
    } catch {
        return null;
    }
}

/** The arrow of `theme`, of a theme it falls back to, or Adwaita's, at its biggest. */
function loadArrow(theme: string): Arrow | null {
    const queue = [theme, 'Adwaita'];
    const seen = new Set<string>();
    while (queue.length && seen.size < 12) {
        const name = queue.shift()!;
        if (seen.has(name)) continue;
        seen.add(name);
        for (const dir of iconDirs()) {
            for (const file of ['default', 'left_ptr']) {
                const data = readFile(GLib.build_filenamev([dir, name, 'cursors', file]));
                const image = data && largestImage(cursorImages(data));
                if (!data || !image) continue;
                const content = St.ImageContent.new_with_preferred_size(image.width, image.height) as St.ImageContent;
                const pixels = new GLib.Bytes(data.subarray(image.offset, image.offset + image.width * image.height * 4));
                // Xcursor pixels are little-endian ARGB words: B, G, R, A in memory.
                content.set_bytes(pixels, Cogl.PixelFormat.BGRA_8888_PRE, image.width, image.height, image.width * 4);
                return { image, content };
            }
            const index = readFile(GLib.build_filenamev([dir, name, 'index.theme']));
            if (index) queue.splice(queue.length - 1, 0, ...inheritedThemes(new TextDecoder().decode(index)));
        }
    }
    return null;
}

/**
 * Shake the pointer to find it, as on macOS: a quick wiggle makes the arrow
 * three times as big for a moment. The real pointer is hidden meanwhile and
 * a sharp copy of the theme's biggest arrow is drawn in its place. Not
 * while a button is held, so dragging never sets it off.
 */
export class ShakeToFind {
    private readonly detector = new ShakeDetector();
    private readonly tracker = Meta.CursorTracker.get_for_display(global.display);
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly themeId: number;
    private readonly filterId: number;
    /** undefined until first needed; null when the theme has no arrow to read. */
    private arrow: Arrow | null | undefined;
    private actor: St.Widget | null = null;
    private holdId = 0;
    private shrinking = false;

    constructor() {
        this.themeId = this.interface.connect('changed::cursor-theme', () => {
            this.arrow = undefined;
        });
        this.filterId = Clutter.Event.add_filter(global.stage as Clutter.Stage, (event: Clutter.Event) => this.handle(event));
    }

    destroy(): void {
        Clutter.Event.remove_filter(this.filterId);
        this.interface.disconnect(this.themeId);
        this.finish();
    }

    /** Exposed for the devshell, which cannot shake a real mouse. */
    handle(event: Clutter.Event): boolean {
        if (event.type() !== Clutter.EventType.MOTION) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (this.actor) this.place(x, y);
        if (event.get_state() & BUTTONS) {
            this.detector.reset();
            return Clutter.EVENT_PROPAGATE;
        }
        if (this.detector.push(event.get_time(), x, y)) this.grow(x, y);
        return Clutter.EVENT_PROPAGATE;
    }

    private grow(x: number, y: number): void {
        if (this.holdId) GLib.source_remove(this.holdId);
        this.holdId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOLD_MS, () => {
            this.holdId = 0;
            this.shrink();
            return GLib.SOURCE_REMOVE;
        });
        if (this.actor && !this.shrinking) return;
        if (!this.actor) {
            if (this.arrow === undefined) this.arrow = loadArrow(this.interface.get_string('cursor-theme'));
            const arrow = this.arrow;
            if (!arrow || !this.tracker.get_pointer_visible()) return;
            const { image } = arrow;
            // The size the pointer shows at now, then GROW times that.
            const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
            const shown = (Meta.prefs_get_cursor_size() / image.nominal) * scale;
            const actor = new St.Widget({ content: arrow.content, reactive: false, width: image.width * shown * GROW, height: image.height * shown * GROW });
            actor.set_pivot_point(image.xhot / image.width, image.yhot / image.height);
            actor.set_scale(1 / GROW, 1 / GROW);
            global.stage.add_child(actor);
            this.actor = actor;
            this.place(x, y);
            this.tracker.set_pointer_visible(false);
        }
        this.shrinking = false;
        this.actor.remove_all_transitions();
        (this.actor as unknown as Easeable).ease({ scale_x: 1, scale_y: 1, duration: GROW_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    private shrink(): void {
        const actor = this.actor;
        if (!actor) return;
        this.shrinking = true;
        (actor as unknown as Easeable).ease({
            scale_x: 1 / GROW,
            scale_y: 1 / GROW,
            duration: SHRINK_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            onStopped: () => {
                if (this.shrinking && this.actor === actor) this.finish();
            },
        });
    }

    /** The arrow's hotspot on the pointer. */
    private place(x: number, y: number): void {
        const actor = this.actor;
        if (!actor) return;
        const [px, py] = actor.get_pivot_point();
        actor.set_position(Math.round(x - px * actor.width), Math.round(y - py * actor.height));
    }

    private finish(): void {
        if (this.holdId) GLib.source_remove(this.holdId);
        this.holdId = 0;
        this.shrinking = false;
        if (!this.actor) return;
        this.actor.destroy();
        this.actor = null;
        this.tracker.set_pointer_visible(true);
        this.detector.reset();
    }
}
