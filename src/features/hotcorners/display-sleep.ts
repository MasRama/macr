import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Mutter's power save modes: on, and off. */
const ON = 0;
const OFF = 3;
/** The pointer is still moving into the corner: input wakes the displays only after this much stillness, in milliseconds. */
const SETTLE = 1000;

/**
 * macOS Put Display to Sleep: the displays go dark over mutter's D-Bus
 * PowerSaveMode and wake on the next key press or pointer move.
 */
export class DisplaySleep {
    private readonly idle = global.backend.get_core_idle_monitor();
    private idleId = 0;
    private activeId = 0;

    sleep(): void {
        this.stopWatching();
        setPowerSave(OFF);
        this.idleId = this.idle.add_idle_watch(SETTLE, () => {
            this.idle.remove_watch(this.idleId);
            this.idleId = 0;
            this.activeId = this.idle.add_user_active_watch(() => {
                this.activeId = 0;
                setPowerSave(ON);
            });
        });
    }

    destroy(): void {
        const asleep = this.idleId !== 0 || this.activeId !== 0;
        this.stopWatching();
        if (asleep) setPowerSave(ON);
    }

    private stopWatching(): void {
        for (const id of [this.idleId, this.activeId]) if (id) this.idle.remove_watch(id);
        this.idleId = 0;
        this.activeId = 0;
    }
}

/** Asynchronous: the shell is mutter, so a blocking call to it would wait on itself. */
function setPowerSave(mode: number): void {
    Gio.DBus.session.call(
        'org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig',
        'org.freedesktop.DBus.Properties',
        'Set',
        new GLib.Variant('(ssv)', ['org.gnome.Mutter.DisplayConfig', 'PowerSaveMode', new GLib.Variant('i', mode)]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (bus, result) => {
            try {
                bus!.call_finish(result);
            } catch (error) {
                console.warn(`Macr: could not set the displays' power save mode: ${error}`);
            }
        },
    );
}
