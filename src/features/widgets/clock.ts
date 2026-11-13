import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { type Box, cityCode, cityName, handAngles, offsetLabel, relativeDay, type WidgetId, type WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

type Rgba = [number, number, number, number];

const DARK = { face: [0.02, 0.02, 0.03, 1] as Rgba, ink: [1, 1, 1, 1] as Rgba, dim: [0.6, 0.6, 0.63, 1] as Rgba };
const LIGHT = { face: [0.95, 0.95, 0.97, 1] as Rgba, ink: [0.07, 0.07, 0.08, 1] as Rgba, dim: [0.55, 0.55, 0.58, 1] as Rgba };
const SECOND_HAND: Rgba = [1, 0.62, 0.04, 1];
const FONT = 'SF Pro Display';

/**
 * The macOS clock widget: an analog face with the local city's code,
 * ticking every second; medium shows here beside GNOME Clocks' world clocks.
 */
export class ClockWidget extends DesktopWidget {
    private readonly area: St.DrawingArea;
    private light = false;
    private timerId = 0;
    private worldId = 0;
    private readonly world = new Gio.Settings({ schema_id: 'org.gnome.shell.world-clocks' });

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        this.area = new St.DrawingArea({ x_expand: true, y_expand: true });
        this.area.connect('repaint', () => this.draw());
        this.actor.add_child(this.area);
        this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (this.actor.is_mapped()) this.area.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
        // The date menu reads the new list on the same signal, before this.
        if (size === 'medium') this.worldId = this.world.connect('changed::locations', () => this.area.queue_repaint());
    }

    override setLight(light: boolean): void {
        this.light = light;
        super.setLight(light);
    }

    override destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        if (this.worldId) this.world.disconnect(this.worldId);
        this.worldId = 0;
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
        const now = GLib.DateTime.new_now_local();
        if (this.size === 'medium') {
            this.drawWorld(cr, width, height, now, colors);
        } else {
            const code = cityCode(now.get_timezone().get_identifier());
            drawFace(cr, width / 2, height / 2, Math.min(width, height) / 2 - 10 * scale, now, code, colors, scale);
        }
        // Frees the context now rather than at garbage collection.
        (cr as unknown as { $dispose(): void }).$dispose();
    }

    /** Medium: here and up to three world clocks from GNOME Clocks, each with its city, day and hours from here. */
    private drawWorld(cr: Cairo.Context, width: number, height: number, now: GLib.DateTime, colors: Colors): void {
        const scale = this.host.scale;
        const clocks = [{ name: cityName(now.get_timezone().get_identifier()), time: now }, ...worldClocks().map((clock) => ({ name: clock.name, time: now.to_timezone(clock.zone) ?? now }))].slice(0, 4);
        const column = width / 4;
        const r = Math.min(column / 2 - 8 * scale, height * 0.27);
        const here = now.format('%F') ?? '';
        clocks.forEach((clock, index) => {
            const cx = column * (index + (4 - clocks.length) / 2) + column / 2;
            const cy = 16 * scale + r;
            drawFace(cr, cx, cy, r, clock.time, '', colors, scale, true);
            const days = { today: _('Today'), tomorrow: _('Tomorrow'), yesterday: _('Yesterday') };
            const offset = offsetLabel((clock.time.get_utc_offset() - now.get_utc_offset()) / 1e6);
            const day = days[relativeDay(here, clock.time.format('%F') ?? '')];
            drawCentred(cr, clock.name, cx, cy + r + 18 * scale, column - 8 * scale, 10.5 * scale, colors.ink, true);
            drawCentred(cr, offset ? `${day}, ${offset}` : day, cx, cy + r + 32 * scale, column - 4 * scale, 9 * scale, colors.dim, false);
        });
    }
}

type Colors = typeof DARK;

/** One analog face: ticks, numerals (dots when `compact`), the `label` under the 12 and the hands. */
function drawFace(cr: Cairo.Context, cx: number, cy: number, r: number, time: GLib.DateTime, label: string, colors: Colors, scale: number, compact = false): void {
    const set = ([red, green, blue, alpha]: Rgba) => cr.setSourceRGBA(red, green, blue, alpha);
    const thin = compact ? 0.6 : 1;

    set(colors.face);
    cr.arc(cx, cy, r, 0, 2 * Math.PI);
    cr.fill();

    // Minute ticks.
    set(colors.dim);
    cr.setLineCap(Cairo.LineCap.ROUND);
    if (!compact) {
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0) continue;
            const a = (i / 60) * 2 * Math.PI;
            cr.setLineWidth(1 * scale);
            cr.moveTo(cx + Math.sin(a) * r * 0.9, cy - Math.cos(a) * r * 0.9);
            cr.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95);
            cr.stroke();
        }
    }

    // Hour numerals, or hour ticks on a small face.
    set(colors.ink);
    cr.selectFontFace(FONT, Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
    cr.setFontSize(r * 0.18);
    for (let hour = 1; hour <= 12; hour++) {
        const a = (hour / 12) * 2 * Math.PI;
        if (compact) {
            set(hour % 3 === 0 ? colors.ink : colors.dim);
            cr.setLineWidth(1.5 * scale);
            cr.moveTo(cx + Math.sin(a) * r * 0.78, cy - Math.cos(a) * r * 0.78);
            cr.lineTo(cx + Math.sin(a) * r * 0.9, cy - Math.cos(a) * r * 0.9);
            cr.stroke();
            continue;
        }
        const text = String(hour);
        const extents = cr.textExtents(text);
        cr.moveTo(cx + Math.sin(a) * r * 0.72 - extents.width / 2 - extents.xBearing, cy - Math.cos(a) * r * 0.72 - extents.height / 2 - extents.yBearing);
        cr.showText(text);
    }

    // The city, under the 12.
    if (label) {
        set(colors.dim);
        cr.selectFontFace(FONT, Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(r * 0.12);
        const extents = cr.textExtents(label);
        cr.moveTo(cx - extents.width / 2 - extents.xBearing, cy - r * 0.3);
        cr.showText(label);
    }

    const angles = handAngles(time.get_hour(), time.get_minute(), time.get_second());
    const hand = (degrees: number, length: number, tail: number, lineWidth: number, color: Rgba) => {
        const a = (degrees * Math.PI) / 180;
        set(color);
        cr.setLineWidth(lineWidth);
        cr.moveTo(cx - Math.sin(a) * tail, cy + Math.cos(a) * tail);
        cr.lineTo(cx + Math.sin(a) * length, cy - Math.cos(a) * length);
        cr.stroke();
    };
    hand(angles.hour, r * 0.5, 0, 4.5 * scale * thin, colors.ink);
    hand(angles.minute, r * 0.8, 0, 3 * scale * thin, colors.ink);
    set(colors.ink);
    cr.arc(cx, cy, 4 * scale * thin, 0, 2 * Math.PI);
    cr.fill();
    hand(angles.second, r * 0.86, r * 0.16, 1.2 * scale, SECOND_HAND);
    set(SECOND_HAND);
    cr.arc(cx, cy, 2.2 * scale * thin, 0, 2 * Math.PI);
    cr.fill();
}

/** `text` centred on `cx` with its baseline at `y`, cut with an ellipsis to `width`. */
function drawCentred(cr: Cairo.Context, text: string, cx: number, y: number, width: number, size: number, color: Rgba, bold: boolean): void {
    cr.setSourceRGBA(...color);
    cr.selectFontFace(FONT, Cairo.FontSlant.NORMAL, bold ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
    cr.setFontSize(size);
    let shown = text;
    while (shown.length > 1 && cr.textExtents(shown).xAdvance > width) shown = `${shown.slice(0, -2)}…`;
    const extents = cr.textExtents(shown);
    cr.moveTo(cx - extents.xAdvance / 2, y);
    cr.showText(shown);
}

/** The parts of a GWeather.Location the widget reads (GWeather has no typings here). */
interface WorldLocation {
    get_city_name(): string | null;
    get_name(): string | null;
    get_timezone(): GLib.TimeZone | null;
}

/** The world clocks picked in GNOME Clocks, from the date menu's own list. */
function worldClocks(): { name: string; zone: GLib.TimeZone }[] {
    const dateMenu = Main.panel.statusArea.dateMenu as unknown as { _clocksItem?: { _locations?: { location: WorldLocation }[] } } | undefined;
    const clocks: { name: string; zone: GLib.TimeZone }[] = [];
    for (const { location } of dateMenu?._clocksItem?._locations ?? []) {
        const zone = location.get_timezone();
        if (zone) clocks.push({ name: location.get_city_name() ?? location.get_name() ?? '', zone });
    }
    return clocks;
}
