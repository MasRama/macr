import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import UPower from 'gi://UPowerGlib';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { batteryIcon, type BatteryDevice, batteryLevel, shownBatteries } from './logic/batteries.js';
import type { WidgetId } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

type Rgba = [number, number, number, number];

const GREEN: Rgba = [0.19, 0.82, 0.35, 1];
const RED: Rgba = [1, 0.27, 0.23, 1];
const TRACK_DARK: Rgba = [1, 1, 1, 0.14];
const TRACK_LIGHT: Rgba = [0, 0, 0, 0.09];
/** UPower states in which the device is on its charger. */
const PLUGGED = [UPower.DeviceState.CHARGING, UPower.DeviceState.FULLY_CHARGED, UPower.DeviceState.PENDING_CHARGE];

type Shown = BatteryDevice & { device: UPower.Device };

/** One ring: the charge as a green (or red) arc round the device's icon. */
class Ring {
    readonly actor: St.Widget;
    private readonly area: St.DrawingArea;
    private readonly icon: St.Icon;
    private percentage = 0;
    private color: Rgba = GREEN;
    private charging = false;
    private light = false;

    constructor(size: number, iconSize: number) {
        this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout(), width: size, height: size });
        this.area = new St.DrawingArea({ x_expand: true, y_expand: true });
        this.area.connect('repaint', () => this.draw());
        this.icon = new St.Icon({ style_class: 'macr-widget-battery-icon', icon_size: iconSize, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(this.area);
        this.actor.add_child(this.icon);
    }

    /** `device` null: an empty ring. */
    set(device: BatteryDevice | null, light: boolean): void {
        this.percentage = device?.percentage ?? 0;
        this.charging = device?.charging ?? false;
        this.color = device && batteryLevel(device) === 'low' ? RED : GREEN;
        this.light = light;
        this.icon.gicon = Gio.ThemedIcon.new_from_names(batteryIcon(device?.kind ?? 'battery'));
        this.icon.visible = device !== null;
        this.area.queue_repaint();
    }

    private draw(): void {
        const cr = this.area.get_context() as Cairo.Context;
        const [width, height] = this.area.get_surface_size();
        const line = Math.max(3, Math.round(width * 0.075));
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - line / 2 - 1;
        const set = ([red, green, blue, alpha]: Rgba) => cr.setSourceRGBA(red, green, blue, alpha);
        cr.setLineWidth(line);
        cr.setLineCap(Cairo.LineCap.ROUND);

        set(this.light ? TRACK_LIGHT : TRACK_DARK);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.stroke();

        if (this.percentage > 0) {
            set(this.color);
            const start = -Math.PI / 2;
            cr.arc(cx, cy, r, start, start + (2 * Math.PI * Math.min(this.percentage, 100)) / 100);
            cr.stroke();
        }

        // A bolt on the top of the ring while it charges.
        if (this.charging) {
            const s = line * 1.5;
            const bx = cx;
            const by = cy - r;
            cr.setLineWidth(1);
            set(this.light ? [1, 1, 1, 1] : [0.11, 0.11, 0.12, 1]);
            cr.arc(bx, by, s * 0.85, 0, 2 * Math.PI);
            cr.fill();
            set(this.light ? [0.11, 0.11, 0.12, 1] : [1, 1, 1, 1]);
            cr.moveTo(bx + s * 0.15, by - s * 0.6);
            cr.lineTo(bx - s * 0.35, by + s * 0.1);
            cr.lineTo(bx - s * 0.02, by + s * 0.1);
            cr.lineTo(bx - s * 0.15, by + s * 0.6);
            cr.lineTo(bx + s * 0.35, by - s * 0.1);
            cr.lineTo(bx + s * 0.02, by - s * 0.1);
            cr.closePath();
            cr.fill();
        }
        // Frees the context now rather than at garbage collection.
        (cr as unknown as { $dispose(): void }).$dispose();
    }
}

/**
 * The macOS small Batteries widget: the computer's battery and those of a
 * mouse, keyboard or headset UPower knows, as rings; one device gets one
 * big ring with its charge under it.
 */
export class BatteriesWidget extends DesktopWidget {
    private readonly box: St.Widget;
    private client: UPower.Client | null = null;
    private readonly cancellable = new Gio.Cancellable();
    private clientIds: number[] = [];
    private deviceIds: [UPower.Device, number][] = [];
    private light = false;
    private syncId = 0;

    constructor(id: WidgetId, size: number, host: WidgetHost) {
        super(id, size, host);
        this.box = new St.Widget({ style_class: 'macr-widget-batteries-box', layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });
        this.actor.add_child(this.box);
        const client = new UPower.Client();
        // UPower 1.90's client is a GAsyncInitable; the typings are 0.99's.
        const initable = client as unknown as Gio.AsyncInitable;
        initable.init_async(GLib.PRIORITY_DEFAULT, this.cancellable, (_object: unknown, result: Gio.AsyncResult) => {
            try {
                initable.init_finish(result);
            } catch (error) {
                if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))) console.warn(`Macr: UPower: ${error}`);
                this.sync();
                return;
            }
            this.client = client;
            this.clientIds = [client.connect('device-added', () => this.queueSync()), client.connect('device-removed', () => this.queueSync())];
            this.sync();
        });
        this.sync();
    }

    override setLight(light: boolean): void {
        this.light = light;
        super.setLight(light);
        this.sync();
    }

    override destroy(): void {
        this.cancellable.cancel();
        if (this.syncId) GLib.source_remove(this.syncId);
        this.syncId = 0;
        this.forgetDevices();
        for (const id of this.clientIds) this.client?.disconnect(id);
        this.clientIds = [];
        this.client = null;
        super.destroy();
    }

    protected activate(): void {
        this.openApp('gnome-power-panel.desktop');
    }

    private forgetDevices(): void {
        for (const [device, id] of this.deviceIds) device.disconnect(id);
        this.deviceIds = [];
    }

    /** Devices tell every property one by one: build once they are done. */
    private queueSync(): void {
        if (this.syncId) return;
        this.syncId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this.syncId = 0;
            this.sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    private sync(): void {
        this.forgetDevices();
        const devices = this.client?.get_devices() ?? [];
        const shown = shownBatteries(
            devices.map(
                (device): Shown => ({
                    device,
                    kind: UPower.Device.kind_to_string(device.kind),
                    percentage: device.percentage,
                    present: device.is_present,
                    powerSupply: device.power_supply,
                    charging: PLUGGED.includes(device.state),
                    name: device.model || UPower.Device.kind_to_string(device.kind),
                }),
            ),
        );
        for (const { device } of shown) this.deviceIds.push([device, device.connect('notify', () => this.queueSync())]);
        this.box.destroy_all_children();
        if (shown.length <= 1) this.buildOne(shown[0] ?? null);
        else this.buildGrid(shown);
    }

    /** One big ring and the charge under it, or "No Batteries". */
    private buildOne(device: Shown | null): void {
        const scale = this.host.scale;
        const column = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        const ring = new Ring(Math.round(86 * scale), Math.round(32 * scale));
        ring.set(device, this.light);
        ring.actor.x_align = Clutter.ActorAlign.CENTER;
        column.add_child(ring.actor);
        const text = device ? `${Math.round(device.percentage)}%` : _('No Batteries');
        column.add_child(new St.Label({ text, style_class: device ? 'macr-widget-battery-percent' : 'macr-widget-battery-none', x_align: Clutter.ActorAlign.CENTER }));
        this.box.add_child(column);
    }

    /** Two to four rings in a square, empty places as dim rings. */
    private buildGrid(devices: Shown[]): void {
        const scale = this.host.scale;
        const layout = new Clutter.GridLayout();
        const grid = new St.Widget({ layout_manager: layout, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        layout.set_row_spacing(Math.round(12 * scale));
        layout.set_column_spacing(Math.round(12 * scale));
        for (let i = 0; i < 4; i++) {
            const ring = new Ring(Math.round(58 * scale), Math.round(22 * scale));
            ring.set(devices[i] ?? null, this.light);
            layout.attach(ring.actor, i % 2, Math.floor(i / 2), 1, 1);
        }
        this.box.add_child(grid);
    }
}
