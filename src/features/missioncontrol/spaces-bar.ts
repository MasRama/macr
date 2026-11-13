import type Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { FixedSpaces } from './fixed-spaces.js';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
/** GNOME 46's workspace thumbnail and the Spaces bar that holds them. */
type Thumbnail = St.Widget & { metaWorkspace: Meta.Workspace; _removed: boolean };
export type SpacesBox = St.Widget & { _monitorIndex: number; _thumbnails: Thumbnail[] };
type DragSource = { metaWindow?: Meta.Window };

/** The + button's gap to the monitor's right edge, in logical pixels. */
const EDGE = 24;

/**
 * The + and × of macOS Mission Control on one Spaces bar. + sits at the
 * right end of the bar's row on its monitor: a click adds a Space, a
 * window dropped on it goes to a new one. × shows on the thumbnail under
 * the pointer, while there is more than one Space, and closes that Space.
 */
export class SpacesBar {
    private readonly add: St.Button;
    private readonly closes = new Set<St.Button>();
    private readonly ids: [Signals, number][] = [];
    private laterId = 0;

    constructor(readonly box: SpacesBox, private readonly spaces: FixedSpaces) {
        this.add = new St.Button({
            style_class: 'macr-spaces-add',
            child: new St.Icon({ icon_name: 'list-add-symbolic' }),
            accessible_name: _('Add Desktop'),
            reactive: true,
            track_hover: true,
        });
        this.add.connect('clicked', () => this.spaces.add(global.get_current_time()));
        (this.add as unknown as { _delegate: object })._delegate = {
            handleDragOver: (source: DragSource) => (source.metaWindow ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE),
            acceptDrop: (source: DragSource) => {
                if (!source.metaWindow) return false;
                const space = this.spaces.add(global.get_current_time());
                Main.moveWindowToMonitorAndWorkspace(source.metaWindow, this.box._monitorIndex, space.index());
                return true;
            },
        };
        Main.layoutManager.overviewGroup.add_child(this.add);

        for (const signal of ['notify::allocation', 'notify::translation-y']) this.connect(box, signal, () => this.queuePlace());
        for (const signal of ['notify::opacity', 'notify::visible', 'notify::mapped']) this.connect(box, signal, () => this.syncShown());
        this.connect(box, 'child-added', (_box: never, child: Clutter.Actor) => this.decorate(child as Thumbnail));
        this.connect(box, 'motion-event', () => this.syncCloses());
        this.connect(box, 'leave-event', () => this.syncCloses());
        this.refresh();
    }

    /** Thumbnails come anew each time the overview opens. */
    refresh(): void {
        for (const thumbnail of this.box._thumbnails ?? []) this.decorate(thumbnail);
        this.syncShown();
        this.queuePlace();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        if (this.laterId) global.compositor.get_laters().remove(this.laterId);
        this.laterId = 0;
        for (const close of this.closes) close.destroy();
        this.closes.clear();
        this.add.destroy();
    }

    private connect(object: object, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }

    private decorate(thumbnail: Thumbnail): void {
        if (!thumbnail.metaWorkspace || [...this.closes].some((close) => close.get_parent() === thumbnail)) return;
        const close = new St.Button({
            style_class: 'macr-spaces-close',
            child: new St.Icon({ icon_name: 'window-close-symbolic' }),
            accessible_name: _('Close Desktop'),
            reactive: true,
            visible: false,
        });
        close.connect('clicked', () => this.spaces.close(thumbnail.metaWorkspace, global.get_current_time()));
        close.connect('destroy', () => this.closes.delete(close));
        thumbnail.add_child(close);
        this.closes.add(close);
    }

    /** Only the thumbnail under the pointer shows its ×. */
    private syncCloses(): void {
        const [x, y] = global.get_pointer();
        const several = global.workspace_manager.get_n_workspaces() > 1;
        for (const close of this.closes) {
            const thumbnail = close.get_parent() as Thumbnail;
            close.visible = several && !thumbnail._removed && contains(thumbnail, x, y);
        }
    }

    private syncShown(): void {
        this.add.visible = this.box.visible && this.box.mapped;
        this.add.opacity = this.box.opacity;
    }

    /** Placed once the bar has its new place, before the frame is drawn. */
    private queuePlace(): void {
        if (this.laterId) return;
        this.laterId = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.laterId = 0;
            this.place();
            return false;
        });
    }

    private place(): void {
        const monitor = Main.layoutManager.monitors[this.box._monitorIndex];
        if (!monitor) return;
        const [, boxY] = this.box.get_transformed_position();
        const [, boxHeight] = this.box.get_transformed_size();
        // A bar that is not on screen has no place yet.
        if (!Number.isFinite(boxY) || !Number.isFinite(boxHeight)) return;
        const [, , width, height] = this.add.get_preferred_size();
        const [groupX, groupY] = Main.layoutManager.overviewGroup.get_transformed_position();
        const edge = EDGE * St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        this.add.set_position(
            Math.round(monitor.x + monitor.width - edge - width - groupX),
            Math.round(boxY + (boxHeight - height) / 2 - groupY),
        );
        this.syncShown();
    }
}

function contains(actor: Clutter.Actor, stageX: number, stageY: number): boolean {
    const [ok, x, y] = actor.transform_stage_point(stageX, stageY);
    return ok && x >= 0 && y >= 0 && x < actor.width && y < actor.height;
}
