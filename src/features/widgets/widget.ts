import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { type Box, type Point, sizesOf, WIDGET_UNIT, type WidgetId, type WidgetSize } from './logic/widgets.js';

/** Pointer travel (logical px) before a press becomes a drag. */
const DRAG_THRESHOLD = 6;
const TINT = 'macr-tint';
const TINT_MS = 250;

/** What a widget asks of the module that holds it. */
export interface WidgetHost {
    /** The widget was dropped at `point` (stage px). */
    moved(id: WidgetId, point: Point): void;
    remove(id: WidgetId): void;
    resize(id: WidgetId, size: WidgetSize): void;
    editWidgets(): void;
    /** The widget opened its app. */
    opened?(): void;
    /** Device pixels per logical pixel. */
    readonly scale: number;
    /** Macr's settings, where notes and reminders are kept. */
    readonly settings: Gio.Settings;
}

type Easeable = {
    ease_property(name: string, value: unknown, params: { duration: number; mode: Clutter.AnimationMode }): void;
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode }): void;
};

/**
 * A desktop widget's frame: a rounded square that can be dragged anywhere,
 * opens its app on a click and has a menu on a right-click. Subclasses fill
 * `actor` and keep their content up to date.
 */
export abstract class DesktopWidget {
    readonly actor: St.Widget;
    /** The right-click menu: sizes, Edit Widgets… and Remove Widget; a widget may add its own items first. */
    protected readonly menu: PopupMenu.PopupMenu;
    private readonly menuManager: PopupMenu.PopupMenuManager;
    private grab: Clutter.Grab | null = null;
    private pressAt: Point | null = null;
    private startAt: Point = { x: 0, y: 0 };
    private dragging = false;

    constructor(
        readonly id: WidgetId,
        readonly size: WidgetSize,
        readonly box: Box,
        protected readonly host: WidgetHost,
    ) {
        this.actor = new St.Widget({
            style_class: `macr-widget macr-widget-${id} macr-widget-${size}`,
            reactive: true,
            width: box.width,
            height: box.height,
            layout_manager: new Clutter.BinLayout(),
        });
        this.actor.add_effect_with_name(TINT, new Clutter.DesaturateEffect({ factor: 0 }));
        this.actor.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onPress(event));
        this.actor.connect('motion-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onMotion(event));
        this.actor.connect('button-release-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onRelease(event));

        this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.TOP);
        styleMenu(this.menu);
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this.menuManager = new PopupMenu.PopupMenuManager(this.actor, {});
        this.menuManager.addMenu(this.menu, -1);
        const sizes = sizesOf(id);
        if (sizes.length > 1) {
            for (const choice of sizes) {
                const item = new PopupMenu.PopupMenuItem(sizeName(choice));
                this.menu.addMenuItem(item);
                item.setOrnament(choice === size ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                item.connect('activate', () => {
                    if (choice !== this.size) this.host.resize(this.id, choice);
                });
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        const edit = new PopupMenu.PopupMenuItem(_('Edit Widgets…'));
        edit.connect('activate', () => this.host.editWidgets());
        this.menu.addMenuItem(edit);
        const remove = new PopupMenu.PopupMenuItem(_('Remove Widget'));
        remove.connect('activate', () => this.host.remove(this.id));
        this.menu.addMenuItem(remove);
    }

    /** In the widget gallery: drawn, but the gallery takes the clicks. */
    setPreview(): void {
        this.actor.reactive = false;
    }

    /** Light or dark, as GNOME's style is. */
    setLight(light: boolean): void {
        if (light) this.actor.add_style_class_name('macr-light');
        else this.actor.remove_style_class_name('macr-light');
        this.repaint();
    }

    /** Toned down while an app window has the focus, full colour on the desktop, as on macOS. */
    setTinted(tinted: boolean): void {
        const params = { duration: TINT_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD };
        (this.actor as unknown as Easeable).ease_property(`@effects.${TINT}.factor`, tinted ? 0.85 : 0, params);
        (this.actor as unknown as Easeable).ease({ opacity: tinted ? 215 : 255, ...params });
    }

    destroy(): void {
        this.release();
        this.menu.destroy();
        this.actor.destroy();
    }

    /** A small widget's side in stage px: a medium is two wide, a large two by two. */
    protected get unit(): number {
        return Math.round(WIDGET_UNIT * this.host.scale);
    }

    /** Redraws what is drawn by hand; the default has nothing to draw. */
    protected repaint(): void {}

    /** Opens the widget's app. */
    protected abstract activate(): void;

    /** Whether a click opens an app (so the Notification Center makes way); false for widgets typed into. */
    protected get opensApp(): boolean {
        return true;
    }

    /** Opens the desktop app `appId` when it is installed. */
    protected openApp(appId: string): void {
        Shell.AppSystem.get_default().lookup_app(appId)?.activate();
    }

    private onPress(event: Clutter.Event): boolean {
        const button = event.get_button();
        if (button === Clutter.BUTTON_SECONDARY) {
            syncMenuScheme(this.menu);
            this.menu.open(true);
            return Clutter.EVENT_STOP;
        }
        if (button !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this.pressAt = { x, y };
        this.startAt = { x: this.actor.x, y: this.actor.y };
        this.dragging = false;
        this.grab = (global.stage as Clutter.Stage).grab(this.actor);
        return Clutter.EVENT_STOP;
    }

    private onMotion(event: Clutter.Event): boolean {
        if (!this.pressAt) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const dx = x - this.pressAt.x;
        const dy = y - this.pressAt.y;
        if (!this.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD * this.host.scale) return Clutter.EVENT_STOP;
        if (!this.dragging) {
            this.dragging = true;
            this.actor.get_parent()?.set_child_above_sibling(this.actor, null);
        }
        this.actor.set_position(this.startAt.x + dx, this.startAt.y + dy);
        return Clutter.EVENT_STOP;
    }

    private onRelease(event: Clutter.Event): boolean {
        if (!this.pressAt || event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const dragged = this.dragging;
        this.release();
        if (dragged) {
            this.host.moved(this.id, { x: this.actor.x, y: this.actor.y });
        } else {
            this.activate();
            if (this.opensApp) this.host.opened?.();
        }
        return Clutter.EVENT_STOP;
    }

    private release(): void {
        this.grab?.dismiss();
        this.grab = null;
        this.pressAt = null;
        this.dragging = false;
    }
}

/** A widget size's name, as macOS writes it. */
export function sizeName(size: WidgetSize): string {
    const names: Record<WidgetSize, string> = { small: _('Small'), medium: _('Medium'), large: _('Large') };
    return names[size];
}
