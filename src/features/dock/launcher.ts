import Gio from 'gi://Gio';
import type GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import { appIdOf, EMPTY_ENTRY, type LauncherEntry, mergeEntry } from './logic/launcher.js';

const UNITY = 'com.canonical.Unity';
const ENTRY_INTERFACE = 'com.canonical.Unity.LauncherEntry';

type Disconnectable = { disconnect(id: number): void };

/**
 * The counts and progress apps send their dock icon over the Unity launcher
 * API. Apps such as Telegram send them only while a dock owns
 * com.canonical.Unity, and send their state again when one takes it, as
 * Dash to Dock does.
 */
export class LauncherEntries {
    private readonly entries = new Map<string, { sender: string; entry: LauncherEntry }>();
    private readonly listeners = new Map<number, (appId: string) => void>();
    private readonly subscriptions: number[] = [];
    private readonly appSystem = Shell.AppSystem.get_default();
    private readonly ids: [Disconnectable, number][] = [];
    private nameId: number;
    private nextListener = 1;

    constructor() {
        const bus = Gio.DBus.session;
        this.subscriptions.push(
            bus.signal_subscribe(null, ENTRY_INTERFACE, 'Update', null, null, Gio.DBusSignalFlags.NONE, (_bus, sender, _path, _iface, _signal, parameters) =>
                this.onUpdate(sender, parameters),
            ),
            // A sender that leaves the bus takes its badges with it.
            bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE, (_bus, _sender, _path, _iface, _signal, parameters) => {
                const [name, , owner] = parameters.deepUnpack() as [string, string, string];
                if (!owner) this.dropSender(name);
            }),
        );
        this.nameId = Gio.bus_own_name_on_connection(bus, UNITY, Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT, null, null);
        this.ids.push([
            this.appSystem,
            this.appSystem.connect('app-state-changed', (_system: Shell.AppSystem, app: Shell.App) => {
                if (app.state === Shell.AppState.STOPPED) this.drop(app.get_id());
            }),
        ]);
    }

    /** What `appId` asked its icon to show. */
    get(appId: string): LauncherEntry {
        return this.entries.get(appId)?.entry ?? EMPTY_ENTRY;
    }

    /** Calls `callback` with the app whose entry changed. */
    connect(callback: (appId: string) => void): number {
        const id = this.nextListener++;
        this.listeners.set(id, callback);
        return id;
    }

    disconnect(id: number): void {
        this.listeners.delete(id);
    }

    destroy(): void {
        const bus = Gio.DBus.session;
        for (const id of this.subscriptions) bus.signal_unsubscribe(id);
        this.subscriptions.length = 0;
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        if (this.nameId) Gio.bus_unown_name(this.nameId);
        this.nameId = 0;
        this.listeners.clear();
        this.entries.clear();
    }

    private onUpdate(sender: string | null, parameters: GLib.Variant): void {
        if (!sender) return;
        const [uri, properties] = parameters.recursiveUnpack() as [string, Record<string, unknown>];
        const appId = appIdOf(uri);
        if (!appId) return;
        const entry = mergeEntry(this.get(appId), properties);
        this.entries.set(appId, { sender, entry });
        this.emit(appId);
    }

    private dropSender(sender: string): void {
        for (const [appId, value] of [...this.entries]) if (value.sender === sender) this.drop(appId);
    }

    private drop(appId: string): void {
        if (!this.entries.delete(appId)) return;
        this.emit(appId);
    }

    private emit(appId: string): void {
        for (const callback of [...this.listeners.values()]) callback(appId);
    }
}

let current: LauncherEntries | null = null;

/** The running dock's launcher entries, for its icons. */
export function launcherEntries(): LauncherEntries | null {
    return current;
}

export function setLauncherEntries(entries: LauncherEntries | null): void {
    current = entries;
}
