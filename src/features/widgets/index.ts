import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module } from '../../shared/module.js';
import { isLight } from '../../shared/scheme.js';
import { type Box, boxOf, defaultSlots, fromFraction, isDesktopIconsTitle, placeWidget, type Point, type Rect, toFraction, type WidgetId, widgetIds, type WidgetSize, widgetSize } from './logic/widgets.js';
import { WidgetGallery } from './gallery.js';
import { removeOldPictures } from './photos.js';
import { WIDGETS } from './registry.js';
import type { DesktopWidget, WidgetHost } from './widget.js';

/** Logical pixels: macOS's small widget, the gap between widgets and their margin from the screen's edge. */
const SIZE = 164;
const GAP = 20;
const MARGIN = 28;

type Disconnectable = { disconnect(id: number): void };
type Positions = Record<string, [number, number]>;
type Sizes = Record<string, string>;

/**
 * macOS Sonoma's desktop widgets: a clock, a calendar, the weather, the
 * batteries and a photo on the desktop. They sit in a layer of their own above the wallpaper and any
 * desktop-icons window, under every app window; Mutter lowers actors that
 * are not windows on each restack, so the layer is put back after it.
 */
export class DesktopWidgetsModule implements Module, WidgetHost {
    private layer: Clutter.Actor | null = null;
    private widgets: DesktopWidget[] = [];
    private ids: [Disconnectable, number][] = [];
    private laterId = 0;
    private gallery: WidgetGallery | null = null;
    private readonly desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

    constructor(private readonly settings: Gio.Settings) {}

    get scale(): number {
        return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
    }

    enable(): void {
        removeOldPictures();
        this.layer = new Clutter.Actor({ name: 'macrDesktopWidgets' });
        global.window_group.add_child(this.layer);
        const listen = (target: unknown, signal: string, callback: () => void) => {
            const object = target as { connect(signal: string, callback: () => void): number } & Disconnectable;
            this.ids.push([object, object.connect(signal, callback)]);
        };
        listen(this.settings, 'changed::desktop-widgets', () => this.build());
        listen(this.settings, 'changed::desktop-widget-sizes', () => this.build());
        listen(this.settings, 'changed::desktop-widget-positions', () => this.place());
        listen(this.desktop, 'changed::color-scheme', () => this.syncScheme());
        listen(global.display, 'restacked', () => this.queueRestack());
        listen(global.display, 'workareas-changed', () => this.place());
        listen(global.display, 'notify::focus-window', () => this.syncTint());
        listen(Main.layoutManager, 'monitors-changed', () => this.build());
        this.build();
        this.restack();
    }

    disable(): void {
        this.gallery?.destroy();
        this.gallery = null;
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        if (this.laterId) global.compositor.get_laters().remove(this.laterId);
        this.laterId = 0;
        for (const widget of this.widgets) widget.destroy();
        this.widgets = [];
        this.layer?.destroy();
        this.layer = null;
    }

    moved(id: WidgetId, point: Point): void {
        this.savePosition(id, point);
        // Unchanged settings send no signal: put it on the grid anyway.
        this.place();
    }

    remove(id: WidgetId): void {
        this.settings.set_strv('desktop-widgets', this.settings.get_strv('desktop-widgets').filter((name) => name !== id));
    }

    resize(id: WidgetId, size: WidgetSize): void {
        const sizes = this.sizes();
        sizes[id] = size;
        this.settings.set_value('desktop-widget-sizes', new GLib.Variant('a{ss}', sizes));
    }

    /**
     * From the gallery: puts `id` on the desktop at `size`, at `point` (stage
     * px) when it was dragged there, else where it was or in the column.
     */
    add(id: WidgetId, size: WidgetSize, point: Point | null): void {
        if (point) this.savePosition(id, point, size);
        const sizes = this.sizes();
        if (sizes[id] !== size) {
            sizes[id] = size;
            this.settings.set_value('desktop-widget-sizes', new GLib.Variant('a{ss}', sizes));
        }
        const list = this.settings.get_strv('desktop-widgets');
        if (!list.includes(id)) this.settings.set_strv('desktop-widgets', [...list, id]);
    }

    /** The widgets on the desktop and their sizes, for the gallery. */
    onDesktop(): Map<WidgetId, WidgetSize> {
        return new Map(this.widgets.map((widget) => [widget.id, widget.size]));
    }

    editWidgets(): void {
        if (this.gallery) return;
        this.gallery = new WidgetGallery(this, this.layer, () => {
            this.gallery = null;
        });
    }

    /** One widget's box in stage px. */
    boxFor(size: WidgetSize): Box {
        const scale = this.scale;
        const box = boxOf(size, SIZE, GAP);
        return { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
    }

    private savePosition(id: WidgetId, point: Point, size?: WidgetSize): void {
        const area = this.area();
        const box = this.boxFor(size ?? this.widgets.find((widget) => widget.id === id)?.size ?? 'small');
        const placed = placeWidget(point.x, point.y, box, area, 8 * this.scale);
        const positions = this.positions();
        positions[id] = toFraction(placed, area);
        this.settings.set_value('desktop-widget-positions', new GLib.Variant('a{s(dd)}', positions));
    }

    private build(): void {
        for (const widget of this.widgets) widget.destroy();
        this.widgets = [];
        const sizes = this.sizes();
        for (const id of widgetIds(this.settings.get_strv('desktop-widgets'))) {
            const size = widgetSize(id, sizes[id]);
            const widget = new WIDGETS[id](id, size, this.boxFor(size), this);
            this.layer?.add_child(widget.actor);
            this.widgets.push(widget);
        }
        this.syncScheme();
        this.syncTint();
        this.place();
    }

    /** Each widget where it was dragged, the others in the default column. */
    private place(): void {
        const area = this.area();
        const scale = this.scale;
        const positions = this.positions();
        const slots = defaultSlots(
            this.widgets.map((widget) => widget.box),
            area,
            GAP * scale,
            MARGIN * scale,
        );
        this.widgets.forEach((widget, index) => {
            const saved = positions[widget.id];
            const at = saved ? fromFraction(saved, area) : slots[index];
            const { x, y } = placeWidget(at.x, at.y, widget.box, area, 1);
            widget.actor.set_position(x, y);
        });
    }

    private sizes(): Sizes {
        return this.settings.get_value('desktop-widget-sizes').deepUnpack() as Sizes;
    }

    private positions(): Positions {
        return this.settings.get_value('desktop-widget-positions').deepUnpack() as Positions;
    }

    /** The primary monitor's work area: under the menu bar, beside any panel. */
    private area(): Rect {
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        return { x: area.x, y: area.y, width: area.width, height: area.height };
    }

    private syncScheme(): void {
        const light = isLight();
        for (const widget of this.widgets) widget.setLight(light);
    }

    /** Full colour while the desktop has the focus, toned down under an app. */
    private syncTint(): void {
        const window = global.display.focus_window;
        const onDesktop = !window || isDesktopWindow(window);
        for (const widget of this.widgets) widget.setTinted(!onDesktop);
    }

    private queueRestack(): void {
        if (this.laterId) return;
        this.laterId = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.laterId = 0;
            this.restack();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Just above the wallpaper and any desktop-icons window, under every other window. */
    private restack(): void {
        const layer = this.layer;
        const group = global.window_group;
        if (!layer || layer.get_parent() !== group) return;
        let below = (Main.layoutManager as unknown as { _backgroundGroup: Clutter.Actor })._backgroundGroup;
        for (const actor of global.get_window_actors()) {
            if (actor.get_parent() === group && isDesktopWindow(actor.get_meta_window())) below = actor;
        }
        if (below.get_parent() === group && layer.get_previous_sibling() !== below) group.set_child_above_sibling(layer, below);
    }
}

/** The desktop itself: an X11 desktop window, a window kept below all others, or a Wayland desktop-icons window. */
function isDesktopWindow(window: Meta.Window | null): boolean {
    if (!window) return false;
    return window.get_window_type() === Meta.WindowType.DESKTOP || window.get_layer() <= Meta.StackLayer.BOTTOM || isDesktopIconsTitle(window.get_title());
}
