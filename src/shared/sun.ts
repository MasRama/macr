import Gio from 'gi://Gio';

import { sunTimes } from './logic/sun.js';

/**
 * Sunrise and sunset from gsd's Night Light, which knows them when location
 * is on; 6:00 and 18:00 otherwise. `changed` runs when gsd's times change.
 */
export class SunWatcher {
    private proxy: Gio.DBusProxy | null = null;
    private proxyId = 0;
    private cancellable: Gio.Cancellable | null = new Gio.Cancellable();

    constructor(changed: () => void) {
        const cancellable = this.cancellable!;
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null,
            'org.gnome.SettingsDaemon.Color',
            '/org/gnome/SettingsDaemon/Color',
            'org.gnome.SettingsDaemon.Color',
            cancellable,
            (_source, result) => {
                let proxy: Gio.DBusProxy;
                try {
                    proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch {
                    // Cancelled, or no settings daemon (the devshell).
                    return;
                }
                if (this.cancellable !== cancellable) return;
                this.cancellable = null;
                this.proxy = proxy;
                this.proxyId = proxy.connect('g-properties-changed', changed);
                changed();
            },
        );
    }

    /** Today's sunrise and sunset, in hours. */
    get times(): { sunrise: number; sunset: number } {
        return sunTimes(this.value('Sunrise'), this.value('Sunset'));
    }

    destroy(): void {
        this.cancellable?.cancel();
        this.cancellable = null;
        if (this.proxy && this.proxyId) this.proxy.disconnect(this.proxyId);
        this.proxy = null;
        this.proxyId = 0;
    }

    private value(name: string): number {
        const value = this.proxy?.get_cached_property(name)?.deepUnpack();
        return typeof value === 'number' ? value : -1;
    }
}
