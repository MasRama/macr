import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';

import type { Module } from '../../shared/module.js';
import { fromSaved, sameWallpaper, shownWallpaper, startWallpapers, toSaved, type Wallpaper } from './logic/wallpapers.js';

/** Each desktop's own wallpaper by index, a(ss); empty follows Desktop 1. */
const SAVED = 'space-wallpapers';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };

/**
 * A wallpaper for each desktop, as on macOS. Picking a wallpaper (in GNOME's
 * Settings or anywhere else that writes org.gnome.desktop.background) gives
 * it to the desktop on screen only; switching desktops writes that
 * desktop's wallpaper back, and GNOME crossfades to it. New desktops start
 * with Desktop 1's, and Desktop 1's is what GNOME keeps once Macr stops.
 */
export class SpaceWallpapersModule implements Module {
    private readonly background = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
    /** Writes both pictures at once, so no one sees half a change. */
    private readonly writer = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
    /** Desktops with a wallpaper of their own; the rest follow Desktop 1. */
    private own = new Map<Meta.Workspace, Wallpaper>();
    private first: Meta.Workspace | null = null;
    /** The wallpaper Macr wrote last, so its own write is not taken as the user's pick. */
    private written: Wallpaper | null = null;
    private ids: [Signals, number][] = [];

    constructor(private readonly settings: Gio.Settings) {
        this.writer.delay();
    }

    enable(): void {
        const manager = global.workspace_manager;
        const saved = fromSaved(this.settings.get_value(SAVED).deepUnpack() as [string, string][]);
        const start = startWallpapers(saved, this.current(), manager.get_n_workspaces());
        start.forEach((wallpaper, index) => {
            if (wallpaper) this.own.set(manager.get_workspace_by_index(index)!, wallpaper);
        });
        this.first = manager.get_workspace_by_index(0);

        this.connect(manager, 'active-workspace-changed', () => this.show());
        for (const signal of ['workspace-added', 'workspace-removed', 'workspaces-reordered']) this.connect(manager, signal, () => this.reindex());
        for (const key of ['picture-uri', 'picture-uri-dark']) this.connect(this.background, `changed::${key}`, () => this.picked());
        this.save();
        this.show();
    }

    disable(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids = [];
        // GNOME keeps Desktop 1's wallpaper; the others are saved for next time.
        const first = this.first && this.own.get(this.first);
        if (first) this.write(first);
        this.own.clear();
        this.first = null;
        this.written = null;
    }

    private connect(object: object, signal: string, callback: () => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }

    private current(): Wallpaper {
        return { light: this.background.get_string('picture-uri'), dark: this.background.get_string('picture-uri-dark') };
    }

    /** The wallpapers in desktop order, null where a desktop follows Desktop 1. */
    private ordered(): (Wallpaper | null)[] {
        const manager = global.workspace_manager;
        const list: (Wallpaper | null)[] = [];
        for (let index = 0; index < manager.get_n_workspaces(); index++) list.push(this.own.get(manager.get_workspace_by_index(index)!) ?? null);
        return list;
    }

    /** The user picked a wallpaper: it is the desktop on screen's. */
    private picked(): void {
        const wallpaper = this.current();
        if (this.written && sameWallpaper(wallpaper, this.written)) return;
        this.written = null;
        this.own.set(global.workspace_manager.get_active_workspace(), wallpaper);
        this.save();
    }

    /** Desktops come, go and move; Desktop 1 may now be another one. */
    private reindex(): void {
        const manager = global.workspace_manager;
        const alive = new Set<Meta.Workspace>();
        for (let index = 0; index < manager.get_n_workspaces(); index++) alive.add(manager.get_workspace_by_index(index)!);
        const firstWallpaper = this.first ? this.own.get(this.first) : undefined;
        for (const workspace of [...this.own.keys()]) if (!alive.has(workspace)) this.own.delete(workspace);
        this.first = manager.get_workspace_by_index(0);
        // A new Desktop 1 that followed the old one keeps showing that wallpaper.
        if (this.first && !this.own.has(this.first) && firstWallpaper) this.own.set(this.first, firstWallpaper);
        this.save();
        this.show();
    }

    private show(): void {
        const list = this.ordered();
        if (!list[0]) return;
        this.write(shownWallpaper(list, global.workspace_manager.get_active_workspace_index()));
    }

    private write(wallpaper: Wallpaper): void {
        if (sameWallpaper(wallpaper, this.current())) return;
        this.written = wallpaper;
        this.writer.set_string('picture-uri', wallpaper.light);
        this.writer.set_string('picture-uri-dark', wallpaper.dark);
        this.writer.apply();
    }

    private save(): void {
        const saved = toSaved(this.ordered());
        if (!saved[0]?.[0] && !saved[0]?.[1]) return;
        this.settings.set_value(SAVED, new GLib.Variant('a(ss)', saved));
    }
}
