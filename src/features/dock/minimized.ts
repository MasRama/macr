import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { fitInSquare } from './logic/minimized.js';

/** The thumbnail shows once the window has poured into it. */
const FADE_IN = { delay: 420, duration: 160 };
/** The app's icon in the thumbnail's corner, as a share of the icon size. */
const BADGE = 0.42;

/**
 * A minimized window waiting in the dock as a thumbnail of itself with its
 * app's icon in the corner, as on macOS. A click brings the window back.
 */
export const MinimizedItem = GObject.registerClass(
    class MinimizedItem extends Dash.DashItemContainer {
        window!: Meta.Window;
        icon!: IconGrid.BaseIcon;
        private button!: St.Button;
        private fresh!: boolean;

        constructor(window: Meta.Window) {
            super();
            this.window = window;
            this.fresh = true;
            this.button = new St.Button({ style_class: 'show-apps macr-dock-window', track_hover: true, can_focus: true });
            this.icon = new IconGrid.BaseIcon(window.get_title() ?? '', {
                setSizeManually: true,
                showLabel: false,
                createIcon: (size: number) => this.thumbnail(size),
            });
            this.icon.y_align = Clutter.ActorAlign.CENTER;
            this.button.set_child(this.icon);
            (this.button as unknown as { _delegate: unknown })._delegate = this;
            this.setChild(this.button);
            this.setLabelText(window.get_title() ?? '');
            this.button.connect('clicked', () => Main.activateWindow(window));
            const titleId = window.connect('notify::title', () => this.setLabelText(window.get_title() ?? ''));
            this.connect('destroy', () => window.disconnect(titleId));
        }

        /** The thumbnail itself, where the genie pours the window. */
        get target(): Clutter.Actor | null {
            return (this.icon as unknown as { icon: Clutter.Actor | null }).icon ?? null;
        }

        private thumbnail(size: number): St.Icon {
            // Placed by hand: a BinLayout centres the badge whatever its alignment.
            const box = new St.Widget({ width: size, height: size });
            const frame = this.window.get_frame_rect();
            const fit = fitInSquare(frame.width, frame.height, size);
            const preview = new Clutter.Actor({
                x: Math.round((size - fit.width) / 2),
                y: Math.round((size - fit.height) / 2),
                width: fit.width,
                height: fit.height,
                // The window's shadow reaches past its frame.
                clip_to_allocation: true,
            });
            const layout = new Shell.WindowPreviewLayout();
            preview.layout_manager = layout;
            layout.add_window(this.window);
            box.add_child(preview);
            const app = Shell.WindowTracker.get_default().get_window_app(this.window);
            if (app) {
                const side = Math.round(size * BADGE);
                const badge = app.create_icon_texture(side);
                badge.set_position(size - side, size - side);
                box.add_child(badge);
            }
            if (this.fresh) {
                // Shown after the genie, which still bends the window it copies.
                this.fresh = false;
                box.opacity = 0;
                box.ease({ opacity: 255, delay: FADE_IN.delay, duration: FADE_IN.duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            }
            return box as unknown as St.Icon;
        }
    },
);

export type MinimizedItem = InstanceType<typeof MinimizedItem>;

/** A window that can wait in the dock: an app's own window, not a dialog. */
function dockable(window: Meta.Window): boolean {
    return window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar;
}

/**
 * Follows which windows are minimized, on every Space, in the order they
 * were minimized; calls `changed` whenever that changes.
 */
export class MinimizedWindows {
    private readonly order = new Map<Meta.Window, number>();
    private readonly watched = new Map<Meta.Window, number[]>();
    private count = 0;
    private readonly createdId: number;

    constructor(private readonly changed: () => void) {
        for (const window of global.display.list_all_windows()) this.watch(window);
        this.createdId = global.display.connect('window-created', (_display: Meta.Display, window: Meta.Window) => {
            this.watch(window);
            this.changed();
        });
    }

    /** The minimized windows, oldest first, with their order. */
    windows(): { window: Meta.Window; order: number }[] {
        return [...this.order]
            .filter(([window]) => window.minimized && dockable(window))
            .map(([window, order]) => ({ window, order }))
            .sort((a, b) => a.order - b.order);
    }

    destroy(): void {
        global.display.disconnect(this.createdId);
        for (const [window, ids] of this.watched) for (const id of ids) window.disconnect(id);
        this.watched.clear();
        this.order.clear();
    }

    private watch(window: Meta.Window): void {
        if (this.watched.has(window)) return;
        if (window.minimized) this.order.set(window, ++this.count);
        const ids = [
            window.connect('notify::minimized', () => {
                if (window.minimized) this.order.set(window, ++this.count);
                else this.order.delete(window);
                this.changed();
            }),
            window.connect('unmanaged', () => {
                for (const id of this.watched.get(window) ?? []) window.disconnect(id);
                this.watched.delete(window);
                this.order.delete(window);
                this.changed();
            }),
        ];
        this.watched.set(window, ids);
    }
}
