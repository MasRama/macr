import Cairo from 'cairo';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { cityCode, handAngles, type WidgetId } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

type Rgba = [number, number, number, number];

const DARK = { face: [0.02, 0.02, 0.03, 1] as Rgba, ink: [1, 1, 1, 1] as Rgba, dim: [0.6, 0.6, 0.63, 1] as Rgba };
const LIGHT = { face: [0.95, 0.95, 0.97, 1] as Rgba, ink: [0.07, 0.07, 0.08, 1] as Rgba, dim: [0.55, 0.55, 0.58, 1] as Rgba };
const SECOND_HAND: Rgba = [1, 0.62, 0.04, 1];
const FONT = 'SF Pro Display';

/** The macOS clock widget: an analog face with the local city's code, ticking every second. */
export class ClockWidget extends DesktopWidget {
    private readonly area: St.DrawingArea;
    private light = false;
    private timerId = 0;

    constructor(id: WidgetId, size: number, host: WidgetHost) {
        super(id, size, host);
        this.area = new St.DrawingArea({ x_expand: true, y_expand: true });
        this.area.connect('repaint', () => this.draw());
        this.actor.add_child(this.area);
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (this.actor.is_mapped()) this.area.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
    }

    override setLight(light: boolean): void {
        this.light = light;
        super.setLight(light);
    }

    override destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        super.destroy();
    }

    protected override repaint(): void {
        this.area.queue_repaint();
    }

    protected activate(): void {
        this.openApp('org.gnome.clocks.desktop');
    }

    private draw(): void {
        const cr = this.area.get_context() as Cairo.Context;
        const [width, height] = this.area.get_surface_size();
        const colors = this.light ? LIGHT : DARK;
        const scale = this.host.scale;
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - 10 * scale;
        const set = ([red, green, blue, alpha]: Rgba) => cr.setSourceRGBA(red, green, blue, alpha);

        set(colors.face);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.fill();

        // Minute ticks.
        set(colors.dim);
        cr.setLineCap(Cairo.LineCap.ROUND);
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0) continue;
            const a = (i / 60) * 2 * Math.PI;
            cr.setLineWidth(1 * scale);
            cr.moveTo(cx + Math.sin(a) * r * 0.9, cy - Math.cos(a) * r * 0.9);
            cr.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95);
            cr.stroke();
        }

        // Hour numerals.
        set(colors.ink);
        cr.selectFontFace(FONT, Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(r * 0.18);
        for (let hour = 1; hour <= 12; hour++) {
            const a = (hour / 12) * 2 * Math.PI;
            const text = String(hour);
            const extents = cr.textExtents(text);
            cr.moveTo(cx + Math.sin(a) * r * 0.72 - extents.width / 2 - extents.xBearing, cy - Math.cos(a) * r * 0.72 - extents.height / 2 - extents.yBearing);
            cr.showText(text);
        }

        // The city, under the 12.
        const now = GLib.DateTime.new_now_local();
        const code = cityCode(now.get_timezone().get_identifier());
        if (code) {
            set(colors.dim);
            cr.selectFontFace(FONT, Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
            cr.setFontSize(r * 0.12);
            const extents = cr.textExtents(code);
            cr.moveTo(cx - extents.width / 2 - extents.xBearing, cy - r * 0.3);
            cr.showText(code);
        }

        const angles = handAngles(now.get_hour(), now.get_minute(), now.get_second());
        const hand = (degrees: number, length: number, tail: number, lineWidth: number, color: Rgba) => {
            const a = (degrees * Math.PI) / 180;
            set(color);
            cr.setLineWidth(lineWidth);
            cr.moveTo(cx - Math.sin(a) * tail, cy + Math.cos(a) * tail);
            cr.lineTo(cx + Math.sin(a) * length, cy - Math.cos(a) * length);
            cr.stroke();
        };
        hand(angles.hour, r * 0.5, 0, 4.5 * scale, colors.ink);
        hand(angles.minute, r * 0.8, 0, 3 * scale, colors.ink);
        set(colors.ink);
        cr.arc(cx, cy, 4 * scale, 0, 2 * Math.PI);
        cr.fill();
        hand(angles.second, r * 0.86, r * 0.16, 1.2 * scale, SECOND_HAND);
        set(SECOND_HAND);
        cr.arc(cx, cy, 2.2 * scale, 0, 2 * Math.PI);
        cr.fill();

        // Frees the context now rather than at garbage collection.
        (cr as unknown as { $dispose(): void }).$dispose();
    }
}
