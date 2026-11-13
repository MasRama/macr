import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { BorrowedMenu } from './borrowed-menu.js';
import { batteryStatus, type BatteryTime } from './logic/battery.js';
import { groups, item, launchApp, menuButton } from './menu-kit.js';

type Disconnectable = { disconnect(id: number): void };
type Signals = Disconnectable & { connect(signal: string, callback: (...args: never[]) => void): number };
type ToggleMenu = Signals & { isOpen: boolean; open(animate: boolean): void; close(animate: boolean): void };
type Toggle = Clutter.Actor & { menu?: ToggleMenu; menuEnabled?: boolean };
type Indicator = St.BoxLayout & { quickSettingsItems: Toggle[] };
type UPowerProxy = { Percentage: number; State: number; TimeToEmpty: number; TimeToFull: number };
type PowerToggle = Clutter.Actor & { _proxy?: UPowerProxy };
/** GNOME 46's quick settings button, once its indicators are set up. */
type QuickSettings = PanelMenu.Button & {
    menu: PopupMenu.PopupMenu & Signals;
    _indicators: St.BoxLayout;
    _network: (Indicator & Record<'_wirelessToggle' | '_wiredToggle' | '_modemToggle' | '_btToggle', Toggle>) | null;
    _bluetooth: Indicator | null;
    _system: Indicator & { _systemItem: { powerToggle: PowerToggle } };
    _backgroundApps?: unknown;
};
type Boxes = { _rightBox: St.BoxLayout };

/** One of GNOME's status icons, moved out of quick settings into a button of its own. */
interface Moved {
    indicator: St.Widget;
    button: PanelMenu.Button;
    destroy(): void;
}

/**
 * Wi-Fi, Bluetooth and the battery as menu bar icons of their own, like
 * macOS. GNOME's own icons move out of quick settings into them, so they
 * keep following the system. Wi-Fi and Bluetooth open GNOME's network and
 * device list (quick settings with that toggle's menu open) under the icon;
 * the battery has a macOS menu. Everything goes back on destroy.
 */
export class StatusMenus {
    private readonly qs = Main.panel.statusArea.quickSettings as unknown as QuickSettings;
    private readonly moved: Moved[] = [];
    private waitId = 0;

    constructor() {
        this.tryStart();
    }

    destroy(): void {
        if (this.waitId) GLib.source_remove(this.waitId);
        this.waitId = 0;
        // Last moved, first back: each goes back before the icon it came before.
        for (const moved of [...this.moved].reverse()) moved.destroy();
        this.moved.length = 0;
    }

    /** Quick settings fills itself in asynchronously at startup: wait for it. */
    private tryStart(): void {
        if (!this.qs._backgroundApps) {
            this.waitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this.waitId = 0;
                this.tryStart();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        const { _network: network, _bluetooth: bluetooth } = this.qs;
        // Each lands right before quick settings, so this reads Bluetooth, battery, Wi-Fi.
        if (bluetooth) this.addToggleMenu('bluetooth', _('Bluetooth'), bluetooth, () => bluetooth.quickSettingsItems);
        this.addBattery();
        if (network) this.addToggleMenu('wifi', _('Wi-Fi'), network, () => [network._wirelessToggle, network._wiredToggle, network._modemToggle, network._btToggle]);
    }

    /** Puts `button` into the bar right before quick settings. */
    private place(role: string, button: PanelMenu.Button): void {
        const right = (Main.panel as unknown as Boxes)._rightBox;
        const at = right.get_children().indexOf((this.qs as unknown as { container: St.Widget }).container);
        Main.panel.addToStatusArea(role, button, at < 0 ? 0 : at, 'right');
    }

    /** Moves GNOME's `indicator` from quick settings into `box`; returns how to put it back. */
    private moveInto(indicator: St.Widget, box: St.Widget): () => void {
        const home = this.qs._indicators;
        const index = home.get_children().indexOf(indicator);
        const next = indicator.get_next_sibling();
        home.remove_child(indicator);
        box.add_child(indicator);
        return () => {
            box.remove_child(indicator);
            // Before the icon it came before, else where it was.
            if (next && next.get_parent() === home) home.insert_child_below(indicator, next);
            else if (!next) home.add_child(indicator);
            else home.insert_child_at_index(indicator, Math.min(index, home.get_n_children()));
        };
    }

    /**
     * An icon that opens quick settings under it, with the first shown
     * toggle's menu (the network or device list) open, and closes them
     * together.
     */
    private addToggleMenu(key: string, name: string, indicator: Indicator, toggles: () => Toggle[]): void {
        const button = new PanelMenu.Button(0.5, `Macr ${name}`, true);
        button.add_style_class_name('macr-status-button');
        const putBack = this.moveInto(indicator, button);
        const borrowed = new BorrowedMenu(button, this.qs);
        const ids: [Disconnectable, number][] = [];
        let open: ToggleMenu | null = null;
        let openId = 0;
        const forget = () => {
            if (open && openId) open.disconnect(openId);
            open = null;
            openId = 0;
        };
        const menu = this.qs.menu;
        ids.push([
            menu,
            menu.connect('open-state-changed', (_menu: unknown, isOpen: boolean) => {
                if (!isOpen || menu.sourceActor !== button) {
                    forget();
                    return;
                }
                const toggle = toggles().find((candidate) => candidate.visible && candidate.menu && candidate.menuEnabled !== false);
                if (!toggle?.menu) return;
                open = toggle.menu;
                open.open(false);
                // Closing the list closes the whole menu, as on macOS.
                openId = open.connect('open-state-changed', (_toggleMenu: unknown, listOpen: boolean) => {
                    if (!listOpen && menu.isOpen && menu.sourceActor === button) menu.close(true);
                });
            }),
        ]);
        // Shown while GNOME shows its icon (a Wi-Fi device, Bluetooth on).
        const sync = () => showButton(button, indicator.visible);
        ids.push([indicator, indicator.connect('notify::visible', sync)]);
        this.place(`macr-status-${key}`, button);
        sync();

        this.moved.push({
            indicator,
            button,
            destroy: () => {
                forget();
                for (const [target, id] of ids) target.disconnect(id);
                borrowed.destroy();
                putBack();
                button.destroy();
            },
        });
    }

    /** GNOME's battery icon, with a macOS battery menu. No battery: it stays in quick settings. */
    private addBattery(): void {
        const indicator = this.qs._system;
        const powerToggle = indicator._systemItem.powerToggle;
        const proxy = () => powerToggle._proxy;
        const box = new St.BoxLayout();
        const button = menuButton(_('Battery'), box, (menu) => buildBatteryMenu(menu, proxy()));
        button.add_style_class_name('macr-status-button');
        let putBack: (() => void) | null = null;
        const sync = () => {
            if (powerToggle.visible && !putBack) {
                putBack = this.moveInto(indicator, box);
            } else if (!powerToggle.visible && putBack) {
                putBack();
                putBack = null;
            }
            showButton(button, powerToggle.visible);
        };
        const id = powerToggle.connect('notify::visible', sync);
        this.place('macr-status-battery', button);
        sync();

        this.moved.push({
            indicator,
            button,
            destroy: () => {
                powerToggle.disconnect(id);
                putBack?.();
                button.destroy();
            },
        });
    }
}

/** macOS's battery menu: charge, power source and time, then Battery Settings. */
function buildBatteryMenu(menu: PopupMenu.PopupMenu, proxy: UPowerProxy | undefined): void {
    if (!proxy) {
        item(menu, _('Battery Settings…'), () => launchApp('gnome-power-panel.desktop'));
        return;
    }
    const status = batteryStatus({ percentage: proxy.Percentage, state: proxy.State, timeToEmpty: proxy.TimeToEmpty, timeToFull: proxy.TimeToFull });
    groups(
        menu,
        (section) => {
            const heading = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: 'macr-battery-heading' });
            heading.add_child(new St.Label({ text: _('Battery'), style_class: 'macr-battery-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
            heading.add_child(new St.Label({ text: status.percent, style_class: 'macr-battery-percent', y_align: Clutter.ActorAlign.CENTER }));
            section.addMenuItem(heading);
            const source = status.source === 'battery' ? _('Power Source: Battery') : _('Power Source: Power Adapter');
            item(section, source, () => {}, false);
            const time = timeText(status.time);
            if (time) item(section, time, () => {}, false);
        },
        (section) => {
            item(section, _('Battery Settings…'), () => launchApp('gnome-power-panel.desktop'));
        },
    );
}

function timeText(time: BatteryTime | null): string | null {
    if (!time) return null;
    switch (time.kind) {
        case 'remaining':
            /* Translators: battery time left, as h:mm. */
            return _('%s remaining').format(time.value);
        case 'until-full':
            /* Translators: time until the battery is full, as h:mm. */
            return _('%s until full').format(time.value);
        case 'charged':
            return _('Fully Charged');
        case 'not-charging':
            return _('Not Charging');
        case 'calculating':
            return _('Calculating…');
    }
}

/** The bar adds a button's container shown: hide both while there is nothing to show. */
function showButton(button: PanelMenu.Button, shown: boolean): void {
    button.visible = shown;
    button.container.visible = shown;
}
