import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { isLight } from '../../shared/scheme.js';
import { stackWidgets } from './logic/notification-center.js';
import { type Box, boxOf, WIDGET_GAP, WIDGET_UNIT, type WidgetId, widgetIds, type WidgetSize, widgetSize } from './logic/widgets.js';
import { WIDGETS } from './registry.js';
import type { DesktopWidget, WidgetHost } from './widget.js';

const LIST = 'notification-center-widgets';
const SIZES = 'notification-center-widget-sizes';
/** Logical pixels between the notifications and the widgets. */
const TOP = 12;

type Disconnectable = { disconnect(id: number): void };
type Sizes = Record<string, string>;
/** GNOME 46's message list in the date menu, as far as Macr uses it. */
type MessageList = St.Widget & { _scrollView: St.ScrollView; _sectionList: St.BoxLayout; _placeholder: St.Widget };

/**
 * Widgets in the Notification Center, under the notifications, as in
 * macOS: the desktop widgets' own classes, in a box that scrolls with the
 * notifications. GNOME's notification sections move into a column Macr puts
 * in the message list's scroll view, with the widgets under them. A click
 * opens the widget's app; the right-click menu changes its size or removes
 * it.
 */
export class NotificationCenterWidgetsModule implements Module, WidgetHost {
    private holder: St.Widget | null = null;
    private column: St.BoxLayout | null = null;
    private list: MessageList | null = null;
    private widgets: DesktopWidget[] = [];
    private ids: [Disconnectable, number][] = [];
    private readonly desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

    constructor(private readonly context: ModuleContext) {}

    get scale(): number {
        return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
    }

    enable(): void {
        const list = (Main.panel.statusArea as unknown as { dateMenu?: { _messageList?: MessageList } }).dateMenu?._messageList;
        if (!list?._scrollView || !list._sectionList) return;
        this.list = list;
        const sections = list._sectionList;
        this.column = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.START });
        list._scrollView.child = this.column;
        sections.y_expand = false;
        this.column.add_child(sections);
        this.holder = new St.Widget({ style_class: 'macr-nc-widgets', x_align: Clutter.ActorAlign.CENTER });
        this.column.add_child(this.holder);
        const listen = (target: unknown, signal: string, callback: () => void) => {
            const object = target as { connect(signal: string, callback: () => void): number } & Disconnectable;
            this.ids.push([object, object.connect(signal, callback)]);
        };
        listen(this.context.settings, `changed::${LIST}`, () => this.build());
        listen(this.context.settings, `changed::${SIZES}`, () => this.build());
        listen(this.desktop, 'changed::color-scheme', () => this.syncScheme());
        listen(St.ThemeContext.get_for_stage(global.stage as Clutter.Stage), 'notify::scale-factor', () => this.build());
        this.build();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        for (const widget of this.widgets) widget.destroy();
        this.widgets = [];
        const list = this.list;
        if (list && this.column) {
            const sections = list._sectionList;
            this.column.remove_child(sections);
            sections.y_expand = true;
            list._scrollView.child = sections;
            list._placeholder.opacity = 255;
        }
        this.column?.destroy();
        this.column = null;
        this.holder = null;
        this.list = null;
    }

    /** Widgets stay in their rows here: one dragged away goes back. */
    moved(): void {
        this.place();
    }

    remove(id: WidgetId): void {
        this.context.settings.set_strv(LIST, this.context.settings.get_strv(LIST).filter((name) => name !== id));
    }

    resize(id: WidgetId, size: WidgetSize): void {
        const sizes = this.sizes();
        sizes[id] = size;
        this.context.settings.set_value(SIZES, new GLib.Variant('a{ss}', sizes));
    }

    /** The app comes up, so the Notification Center goes, as on macOS. */
    opened(): void {
        Main.panel.statusArea.dateMenu?.menu.close(true);
    }

    /** Macr's settings, where the Notification Center's widgets are picked. */
    editWidgets(): void {
        this.opened();
        Main.extensionManager.openExtensionPrefs(GLib.path_get_basename(this.context.path), '', {});
    }

    private build(): void {
        for (const widget of this.widgets) widget.destroy();
        this.widgets = [];
        const sizes = this.sizes();
        for (const id of widgetIds(this.context.settings.get_strv(LIST))) {
            const size = widgetSize(id, sizes[id]);
            const widget = new WIDGETS[id](id, size, this.boxFor(size), this);
            this.holder?.add_child(widget.actor);
            this.widgets.push(widget);
        }
        this.syncScheme();
        this.place();
    }

    private place(): void {
        if (!this.holder) return;
        const scale = this.scale;
        const { points, size } = stackWidgets(this.widgets.map((widget) => widget.box), WIDGET_GAP * scale, this.boxFor('medium').width);
        const top = this.widgets.length ? Math.round(TOP * scale) : 0;
        this.widgets.forEach((widget, index) => widget.actor.set_position(points[index].x, points[index].y + top));
        this.holder.set_size(size.width, size.height + top);
        this.holder.visible = this.widgets.length > 0;
        // With widgets, an empty list shows only them, as on macOS.
        if (this.list) this.list._placeholder.opacity = this.widgets.length > 0 ? 0 : 255;
    }

    private boxFor(size: WidgetSize): Box {
        const scale = this.scale;
        const box = boxOf(size, WIDGET_UNIT, WIDGET_GAP);
        return { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
    }

    private sizes(): Sizes {
        return this.context.settings.get_value(SIZES).deepUnpack() as Sizes;
    }

    private syncScheme(): void {
        const light = isLight();
        for (const widget of this.widgets) widget.setLight(light);
    }
}
