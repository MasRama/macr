import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import { type Box, droppedOnDesktop, fitScale, galleryTiles, type Point, type Rect, type WidgetId, type WidgetSize, wrapRows } from './logic/widgets.js';
import { WIDGETS } from './registry.js';
import { type DesktopWidget, sizeName, type WidgetHost } from './widget.js';

/** Previews are at most this fraction of a widget's size. */
const PREVIEW_SCALE = 0.5;
/** Logical px: the panel's margin from the screen's edges and its padding. */
const MARGIN = 24;
const PADDING = 24;
const TILE_GAP = 12;
const TILE_PADDING = 12;
const GROUP_GAP = 32;
/** The previews take at most this many rows, each filled to about this much. */
const ROWS = 2;
const ROW_FILL = 0.85;
const DRAG_THRESHOLD = 6;
const FADE_MS = 180;

/** What the gallery asks of the desktop widgets module. */
export interface GalleryHost extends WidgetHost {
    /** Puts `id` on the desktop at `size`, at `point` (stage px) or in its place. */
    add(id: WidgetId, size: WidgetSize, point: Point | null): void;
    /** The widgets on the desktop and their sizes. */
    onDesktop(): Map<WidgetId, WidgetSize>;
    /** A widget's box in stage px. */
    boxFor(size: WidgetSize): Box;
}

interface Tile {
    id: WidgetId;
    size: WidgetSize;
    actor: St.Widget;
    frame: St.Widget;
    badge: St.Icon;
    preview: DesktopWidget;
}

type Easeable = { ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onComplete?: () => void }): void };

/**
 * macOS's Edit Widgets: the desktop dims, its widgets stay in view, and a
 * panel at the bottom shows every widget at each size. A click adds one to
 * the desktop; dragging one out drops it where it is let go.
 */
export class WidgetGallery {
    private readonly scrim: St.Widget;
    private readonly clone: Clutter.Clone | null = null;
    private readonly panel: St.BoxLayout;
    private readonly tiles: Tile[] = [];
    private readonly layerId: number = 0;
    private grab: Clutter.Grab | null = null;
    private modal: Clutter.Grab | null = null;
    private press: { tile: Tile; at: Point } | null = null;
    private dragged: Clutter.Clone | null = null;
    private closed = false;
    private destroyed = false;

    constructor(
        private readonly host: GalleryHost,
        private readonly layer: Clutter.Actor | null,
        private readonly onClosed: () => void,
    ) {
        const light = isLight();
        const scale = host.scale;
        this.scrim = new St.Widget({
            style_class: light ? 'macr-gallery-scrim macr-light' : 'macr-gallery-scrim',
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
            opacity: 0,
        });
        this.scrim.connect('button-release-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY && !this.press) this.close();
            return Clutter.EVENT_STOP;
        });
        this.scrim.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
        this.scrim.connect('motion-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onMotion(event));
        Main.uiGroup.add_child(this.scrim);

        // The desktop's widgets, in view above the dimmed screen.
        if (layer) {
            this.clone = new Clutter.Clone({ source: layer, reactive: false });
            this.syncClone();
            this.layerId = layer.connect('notify::allocation', () => this.syncClone());
            this.scrim.add_child(this.clone);
        }

        this.panel = new St.BoxLayout({ style_class: light ? 'macr-gallery macr-light' : 'macr-gallery', vertical: true, reactive: true });
        // Clicks on the panel's background do not close it.
        this.panel.connect('button-release-event', () => Clutter.EVENT_STOP);
        const header = new St.BoxLayout({ style_class: 'macr-gallery-header', x_expand: true });
        header.add_child(new St.Label({ text: _('Widgets'), style_class: 'macr-gallery-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
        const done = new St.Button({ label: _('Done'), style_class: 'macr-gallery-done', can_focus: true });
        done.connect('clicked', () => this.close());
        header.add_child(done);
        this.panel.add_child(header);

        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        // In the stage first: the theme sizes what is measured below.
        this.scrim.add_child(this.panel);
        // The previews at the largest scale, shrunk until they fit in two rows.
        const entries = galleryTiles();
        const groups = new Set(entries.map((entry) => entry.id)).size;
        const available = area.width - 2 * (MARGIN + PADDING) * scale;
        const natural = entries.reduce((sum, entry) => sum + host.boxFor(entry.size).width * PREVIEW_SCALE, 0) + (entries.length * TILE_PADDING + (entries.length - groups) * TILE_GAP + (groups - 1) * GROUP_GAP) * scale;
        const tileScale = fitScale(natural, ROWS * available * ROW_FILL, PREVIEW_SCALE);

        const rows = new St.BoxLayout({ style_class: 'macr-gallery-rows', vertical: true, x_align: Clutter.ActorAlign.CENTER });
        this.panel.add_child(rows);
        // Every group in one row first, so the theme sizes them for measuring.
        const first = new St.BoxLayout({ style_class: 'macr-gallery-row', x_align: Clutter.ActorAlign.CENTER });
        rows.add_child(first);
        const columns: St.BoxLayout[] = [];
        let group: St.BoxLayout | null = null;
        let groupId: WidgetId | null = null;
        for (const entry of entries) {
            if (entry.id !== groupId) {
                groupId = entry.id;
                const column = new St.BoxLayout({ style_class: 'macr-gallery-group', vertical: true });
                group = new St.BoxLayout({ style_class: 'macr-gallery-tiles', y_align: Clutter.ActorAlign.END, y_expand: true });
                column.add_child(group);
                column.add_child(new St.Label({ text: widgetName(entry.id), style_class: 'macr-gallery-name', x_align: Clutter.ActorAlign.CENTER }));
                first.add_child(column);
                columns.push(column);
            }
            group?.add_child(this.tile(entry.id, entry.size, tileScale, light));
        }
        // One row when it fits, else wrapped at the screen's width; every
        // group as tall as the tallest, so the names line up.
        const widths = columns.map((column) => column.get_preferred_width(-1)[1]);
        const tallest = Math.max(...columns.map((column) => column.get_preferred_height(-1)[1]));
        for (const column of columns) column.height = tallest;
        const wrapped = wrapRows(widths, GROUP_GAP * scale, available);
        for (const [index, members] of wrapped.entries()) {
            let row = first;
            if (index > 0) {
                row = new St.BoxLayout({ style_class: 'macr-gallery-row', x_align: Clutter.ActorAlign.CENTER });
                rows.add_child(row);
            }
            for (const member of members) {
                const column = columns[member];
                if (!column || column.get_parent() === row) continue;
                first.remove_child(column);
                row.add_child(column);
            }
        }
        this.sync();

        const [, width] = this.panel.get_preferred_width(-1);
        const [, height] = this.panel.get_preferred_height(width);
        this.panel.set_position(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + area.height - height - MARGIN * scale));

        this.modal = Main.pushModal(this.scrim);
        this.scrim.grab_key_focus();
        (this.scrim as unknown as Easeable).ease({ opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    /** Fades out and goes. */
    close(): void {
        if (this.closed) return;
        this.release();
        this.popModal();
        this.closed = true;
        this.scrim.reactive = false;
        (this.scrim as unknown as Easeable).ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.destroy(),
        });
    }

    /** Goes at once: on close, and when the module stops. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.closed = true;
        this.release();
        this.popModal();
        if (this.layer && this.layerId) this.layer.disconnect(this.layerId);
        for (const tile of this.tiles) tile.preview.destroy();
        this.tiles.length = 0;
        this.scrim.destroy();
        this.onClosed();
    }

    private popModal(): void {
        if (this.modal) Main.popModal(this.modal);
        this.modal = null;
    }

    /** One preview: the real widget, shrunk, with its size under it. */
    private tile(id: WidgetId, size: WidgetSize, scale: number, light: boolean): St.Widget {
        const box = this.host.boxFor(size);
        const preview = new WIDGETS[id](id, size, box, this.host);
        preview.setPreview();
        preview.setLight(light);
        preview.actor.set_scale(scale, scale);
        const frame = new St.Widget({ style_class: 'macr-gallery-preview', width: Math.round(box.width * scale), height: Math.round(box.height * scale) });
        frame.add_child(preview.actor);
        const badge = new St.Icon({ icon_name: 'object-select-symbolic', style_class: 'macr-gallery-badge', x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.START });
        const holder = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        holder.add_child(frame);
        // Takes the clicks over the preview, so its own buttons do not.
        holder.add_child(new St.Widget({ reactive: true, x_expand: true, y_expand: true }));
        holder.add_child(badge);
        const actor = new St.BoxLayout({ style_class: 'macr-gallery-tile', vertical: true, reactive: true, track_hover: true, y_align: Clutter.ActorAlign.END });
        actor.add_child(holder);
        actor.add_child(new St.Label({ text: sizeName(size), style_class: 'macr-gallery-size', x_align: Clutter.ActorAlign.CENTER }));
        const tile: Tile = { id, size, actor, frame, badge, preview };
        actor.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onPress(tile, event));
        actor.connect('motion-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onMotion(event));
        actor.connect('button-release-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onRelease(event));
        this.tiles.push(tile);
        return actor;
    }

    /** Marks the previews already on the desktop at that size. */
    private sync(): void {
        const shown = this.host.onDesktop();
        for (const tile of this.tiles) {
            const added = shown.get(tile.id) === tile.size;
            tile.badge.visible = added;
            tile.frame.opacity = added ? 150 : 255;
        }
    }

    private syncClone(): void {
        const layer = this.layer;
        if (!layer || !this.clone) return;
        const box = layer.get_allocation_box();
        this.clone.set_position(box.x1, box.y1);
        this.clone.set_size(box.get_width(), box.get_height());
    }

    private onPress(tile: Tile, event: Clutter.Event): boolean {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_STOP;
        const [x, y] = event.get_coords();
        this.press = { tile, at: { x, y } };
        this.grab = (global.stage as Clutter.Stage).grab(tile.actor);
        return Clutter.EVENT_STOP;
    }

    private onMotion(event: Clutter.Event): boolean {
        if (!this.press) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const { tile, at } = this.press;
        if (!this.dragged) {
            if (Math.hypot(x - at.x, y - at.y) < DRAG_THRESHOLD * this.host.scale) return Clutter.EVENT_STOP;
            // The widget at its real size, under the pointer where it was taken.
            const box = this.host.boxFor(tile.size);
            this.dragged = new Clutter.Clone({ source: tile.preview.actor, width: box.width, height: box.height, opacity: 230 });
            this.scrim.add_child(this.dragged);
        }
        const box = this.host.boxFor(tile.size);
        this.dragged.set_position(Math.round(x - box.width / 2), Math.round(y - box.height / 2));
        return Clutter.EVENT_STOP;
    }

    private onRelease(event: Clutter.Event): boolean {
        if (!this.press || event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_STOP;
        const { tile } = this.press;
        const dragged = this.dragged;
        const [x, y] = event.get_coords();
        const point = dragged ? { x: dragged.x, y: dragged.y } : null;
        this.release();
        if (!point) this.host.add(tile.id, tile.size, null);
        else if (droppedOnDesktop({ x, y }, this.panelRect())) this.host.add(tile.id, tile.size, point);
        this.sync();
        return Clutter.EVENT_STOP;
    }

    private panelRect(): Rect {
        const [x, y] = this.panel.get_transformed_position();
        const [width, height] = this.panel.get_transformed_size();
        return { x, y, width, height };
    }

    private release(): void {
        this.grab?.dismiss();
        this.grab = null;
        this.dragged?.destroy();
        this.dragged = null;
        this.press = null;
    }
}

function widgetName(id: WidgetId): string {
    const names: Record<WidgetId, string> = {
        clock: _('Clock'),
        calendar: _('Calendar'),
        weather: _('Weather'),
        batteries: _('Batteries'),
        photos: _('Photos'),
    };
    return names[id];
}
