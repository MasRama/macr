import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Arrangement } from '../../shared/logic/arrange.js';
import type { Placement, Rect } from '../../shared/logic/geometry.js';
import { isLight } from '../../shared/scheme.js';
import { tiler } from '../../shared/tiling-link.js';
import { DWELL_MS, drawsLights, glyphParts, greenLightZone, inside } from './logic/zoom.js';

/** Logical px: a glyph's screen, the gap around its parts, and the menu's offset under the light. */
const GLYPH_WIDTH = 26;
const GLYPH_HEIGHT = 18;
const GLYPH_GAP = 2;
const OFFSET = 6;
/** The pointer may stray this long outside the light and the menu. */
const LEAVE_MS = 350;

type Disconnectable = { disconnect(id: number): void };

/**
 * macOS's green light menu: rest the pointer on a window's green light and
 * a menu offers Move & Resize, Fill & Arrange and Full Screen. The app draws
 * the light, so the shell follows the pointer (the cursor tracker) and
 * finds the light from the window's frame. The menu takes no focus, so the
 * window keeps it, and closes once the pointer leaves it.
 */
export class ZoomMenu {
    private readonly tracker = Meta.CursorTracker.get_for_display(global.display);
    private readonly ids: [Disconnectable, number][] = [];
    private dwellId = 0;
    private leaveId = 0;
    private menu: St.BoxLayout | null = null;
    private window: Meta.Window | null = null;
    private windowId = 0;
    private zone: Rect | null = null;

    constructor() {
        this.ids.push([this.tracker, this.tracker.connect('position-invalidated', () => this.onMove())]);
        this.ids.push([global.display, global.display.connect('notify::focus-window', () => this.close())]);
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        this.stopDwell();
        this.close();
    }

    private onMove(): void {
        const [x, y] = global.get_pointer();
        if (this.menu) {
            this.followLeave(x, y);
            return;
        }
        const window = this.windowOnLight(x, y);
        if (!window) {
            this.stopDwell();
            return;
        }
        if (this.dwellId) return;
        this.dwellId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DWELL_MS, () => {
            this.dwellId = 0;
            const [nx, ny] = global.get_pointer();
            if (this.windowOnLight(nx, ny) === window) this.open(window);
            return GLib.SOURCE_REMOVE;
        });
    }

    /** The focused window whose green light is under the pointer, if any. */
    private windowOnLight(x: number, y: number): Meta.Window | null {
        if (Main.overview.visible || (Main as unknown as { modalCount: number }).modalCount > 0) return null;
        const window = global.display.focus_window;
        if (!window) return null;
        const facts = {
            normal: window.get_window_type() === Meta.WindowType.NORMAL && !window.is_attached_dialog(),
            fullscreen: window.is_fullscreen(),
            gtk: !!window.get_gtk_application_id(),
            x11Framed: window.get_client_type() === Meta.WindowClientType.X11 && window.decorated,
        };
        if (!drawsLights(facts) || !inside(greenLightZone(window.get_frame_rect()), x, y)) return null;
        // Nothing of the shell, and no other window, over the light.
        let actor: Clutter.Actor | null = (global.stage as Clutter.Stage).get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        while (actor && !(actor instanceof Meta.WindowActor)) actor = actor.get_parent();
        return actor instanceof Meta.WindowActor && actor.meta_window === window ? window : null;
    }

    private stopDwell(): void {
        if (this.dwellId) GLib.source_remove(this.dwellId);
        this.dwellId = 0;
    }

    private open(window: Meta.Window): void {
        this.close();
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const tiling = tiler();
        const menu = new St.BoxLayout({ style_class: isLight() ? 'macr-zoom-menu macr-light' : 'macr-zoom-menu', vertical: true, reactive: true });
        menu.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
        const done = (action: () => void) => () => {
            this.close();
            action();
        };

        const placements: [Placement, string][][] = [
            [
                ['left', _('Left')],
                ['right', _('Right')],
                ['top', _('Top')],
                ['bottom', _('Bottom')],
            ],
            [
                ['top-left', _('Top Left')],
                ['top-right', _('Top Right')],
                ['bottom-left', _('Bottom Left')],
                ['bottom-right', _('Bottom Right')],
            ],
        ];
        const move = this.section(menu, _('Move & Resize'));
        for (const row of placements) {
            move.rows(row.map(([placement, name]) => ({ kind: placement, name, enabled: tiling.canPlace(window, placement), run: done(() => tiling.place(window, placement)) })), scale);
        }
        const arrange = this.section(menu, _('Fill & Arrange'));
        const canArrange = tiling.canPlace(window) && !!tiling.partner(window);
        const arrangements: [Arrangement, string][] = [
            ['left-right', _('Arrange Left & Right')],
            ['right-left', _('Arrange Right & Left')],
            ['top-bottom', _('Arrange Top & Bottom')],
            ['bottom-top', _('Arrange Bottom & Top')],
        ];
        arrange.rows(
            [
                { kind: 'fill', name: _('Fill'), enabled: tiling.canPlace(window, 'fill'), run: done(() => tiling.place(window, 'fill')) },
                ...arrangements.map(([kind, name]) => ({ kind, name, enabled: canArrange, run: done(() => tiling.arrange(window, kind)) })),
            ],
            scale,
        );

        menu.add_child(new St.Widget({ style_class: 'macr-zoom-separator' }));
        this.item(menu, _('Enter Full Screen'), window.can_maximize(), done(() => window.make_fullscreen()));
        if (tiling.canReturn(window)) this.item(menu, _('Return to Previous Size'), true, done(() => tiling.returnToPrevious(window)));

        Main.layoutManager.uiGroup.add_child(menu);
        const zone = greenLightZone(window.get_frame_rect());
        const area = window.get_work_area_current_monitor();
        const [, width] = menu.get_preferred_width(-1);
        const [, height] = menu.get_preferred_height(width);
        const x = Math.min(Math.max(zone.x - OFFSET * scale, area.x), area.x + area.width - width);
        const y = Math.min(zone.y + zone.height + OFFSET * scale, area.y + area.height - height);
        menu.set_position(Math.round(x), Math.round(y));
        menu.opacity = 0;
        menu.ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });

        this.menu = menu;
        this.window = window;
        this.zone = zone;
        this.windowId = window.connect('unmanaged', () => this.close());
    }

    /** A heading over rows of screen glyphs; the heading names the glyph under the pointer. */
    private section(menu: St.BoxLayout, title: string) {
        const heading = new St.Label({ text: title, style_class: 'macr-zoom-heading' });
        menu.add_child(heading);
        return {
            rows: (glyphs: { kind: Placement | Arrangement; name: string; enabled: boolean; run: () => void }[], scale: number) => {
                const row = new St.BoxLayout({ style_class: 'macr-zoom-row' });
                for (const glyph of glyphs) {
                    const button = new St.Button({ style_class: 'macr-zoom-glyph', can_focus: false, track_hover: true, reactive: glyph.enabled, accessible_name: glyph.name });
                    button.set_child(screenGlyph(glyph.kind, scale));
                    if (!glyph.enabled) button.opacity = 80;
                    button.connect('clicked', glyph.run);
                    button.connect('notify::hover', () => {
                        heading.text = button.hover ? glyph.name : title;
                    });
                    row.add_child(button);
                }
                menu.add_child(row);
            },
        };
    }

    private item(menu: St.BoxLayout, label: string, enabled: boolean, run: () => void): void {
        const button = new St.Button({ style_class: 'macr-zoom-item', can_focus: false, track_hover: true, reactive: enabled, x_expand: true });
        button.set_child(new St.Label({ text: label, x_align: Clutter.ActorAlign.START, x_expand: true }));
        if (!enabled) button.add_style_pseudo_class('insensitive');
        button.connect('clicked', run);
        menu.add_child(button);
    }

    /** Closes the menu once the pointer has been away from the light and the menu a moment. */
    private followLeave(x: number, y: number): void {
        const menu = this.menu;
        if (!menu || !this.zone) return;
        const [mx, my] = menu.get_transformed_position();
        const [mw, mh] = menu.get_transformed_size();
        // The light, the menu and the strip between them.
        const near = inside(this.zone, x, y) || inside({ x: mx, y: Math.min(my, this.zone.y), width: mw, height: my + mh - Math.min(my, this.zone.y) }, x, y);
        if (near) {
            if (this.leaveId) GLib.source_remove(this.leaveId);
            this.leaveId = 0;
            return;
        }
        if (this.leaveId) return;
        this.leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LEAVE_MS, () => {
            this.leaveId = 0;
            this.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    private close(): void {
        if (this.leaveId) GLib.source_remove(this.leaveId);
        this.leaveId = 0;
        if (this.window && this.windowId) this.window.disconnect(this.windowId);
        this.window = null;
        this.windowId = 0;
        this.zone = null;
        this.menu?.destroy();
        this.menu = null;
    }
}

/** A small screen with the part the window takes, and its partner's. */
function screenGlyph(kind: Placement | Arrangement, scale: number): St.Widget {
    const screen = new St.Widget({ style_class: 'macr-zoom-screen', width: GLYPH_WIDTH * scale, height: GLYPH_HEIGHT * scale });
    glyphParts(kind, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_GAP).forEach((part, index) => {
        screen.add_child(
            new St.Widget({
                style_class: index === 0 ? 'macr-zoom-part' : 'macr-zoom-part macr-zoom-partner',
                x: part.x * scale,
                y: part.y * scale,
                width: part.width * scale,
                height: part.height * scale,
            }),
        );
    });
    return screen;
}
