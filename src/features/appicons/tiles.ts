import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { alphaBox, isThemed, themeFamily, tileLayout, tileSvg } from './logic/tile.js';

/** Bump when the tile drawing changes, so cached tiles are drawn again. */
const VERSION = 2;
const SIZE = 256;

type CreateIcon = (this: Shell.App, size: number) => St.Widget;
type Signals = { connect(signal: string, callback: () => void): number; disconnect(id: number): void; emit(signal: string): void };

/**
 * Gives every app whose icon is not in the icon theme a macOS tile, the way
 * macOS frames icons that are not tiles: the original icon is drawn on a
 * light squircle (or cut to one when it is already a square tile) into a
 * cached SVG. Every shell surface that asks an app for its icon
 * (`create_icon_texture`) gets the tile: dock, Launchpad, Spotlight, the app
 * switcher, the overview.
 */
export class IconTiles {
    private readonly original: CreateIcon;
    private readonly dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'macr', 'icons']);
    /** App id to its tile file, or null when the app keeps its own icon. */
    private readonly files = new Map<string, string | null>();
    private theme = new St.IconTheme();
    private family: string[] = [];
    private readonly ids: [Signals, number][] = [];

    constructor() {
        this.family = this.readFamily();
        const cache = St.TextureCache.get_default() as unknown as Signals;
        this.ids.push([cache, cache.connect('icon-theme-changed', () => this.forget())]);
        const apps = Shell.AppSystem.get_default() as unknown as Signals;
        this.ids.push([apps, apps.connect('installed-changed', () => this.forget())]);

        const proto = Shell.App.prototype as unknown as { create_icon_texture: CreateIcon };
        this.original = proto.create_icon_texture;
        const original = this.original;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const tiles = this;
        proto.create_icon_texture = function (this: Shell.App, size: number) {
            const file = tiles.fileFor(this);
            if (!file) return original.call(this, size);
            return new St.Icon({ gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(file) }), icon_size: size, fallback_icon_name: 'application-x-executable' });
        };
        this.refreshIcons();
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        (Shell.App.prototype as unknown as { create_icon_texture: CreateIcon }).create_icon_texture = this.original;
        this.refreshIcons();
    }

    /** Icons already on screen are made again (dock, app grid). */
    private refreshIcons(): void {
        (St.TextureCache.get_default() as unknown as Signals).emit('icon-theme-changed');
    }

    private forget(): void {
        this.files.clear();
        this.theme = new St.IconTheme();
        this.family = this.readFamily();
    }

    /** The current theme and the variants of it that it inherits. */
    private readFamily(): string[] {
        const name = St.Settings.get().gtk_icon_theme ?? 'hicolor';
        for (const dir of this.theme.get_search_path() ?? []) {
            const keyFile = new GLib.KeyFile();
            try {
                keyFile.load_from_file(GLib.build_filenamev([dir, name, 'index.theme']), GLib.KeyFileFlags.NONE);
                const inherits = (keyFile.get_string('Icon Theme', 'Inherits') ?? '').split(',').map((theme) => theme.trim());
                return themeFamily(name, inherits);
            } catch {
                // Not in this folder, or no Inherits line.
            }
        }
        return themeFamily(name, []);
    }

    private fileFor(app: Shell.App): string | null {
        const id = app.get_id();
        if (!id) return null;
        let file = this.files.get(id);
        if (file === undefined) {
            try {
                file = this.makeTile(app);
            } catch (error) {
                console.warn(`Macr: no icon tile for ${id}: ${error}`);
                file = null;
            }
            this.files.set(id, file);
        }
        return file;
    }

    private makeTile(app: Shell.App): string | null {
        const gicon = app.get_icon();
        if (!gicon) return null;
        const source = this.theme.lookup_by_gicon(gicon, SIZE, 0)?.get_filename();
        if (!source || isThemed(source, this.family)) return null;

        const info = Gio.File.new_for_path(source).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const key = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, `${VERSION}:${source}:${info.get_attribute_uint64('time::modified')}`, -1);
        const path = GLib.build_filenamev([this.dir, `${key}.svg`]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) return path;

        let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(source, SIZE, SIZE);
        if (!pixbuf.get_has_alpha()) pixbuf = pixbuf.add_alpha(false, 0, 0, 0);
        const width = pixbuf.get_width();
        const height = pixbuf.get_height();
        const box = alphaBox(pixbuf.get_pixels(), width, height, pixbuf.get_rowstride(), pixbuf.get_n_channels());
        if (box.width === 0) return null;
        const [, png] = pixbuf.save_to_bufferv('png', [], []);
        const svg = tileSvg(GLib.base64_encode(png), tileLayout(box, SIZE), width, height, SIZE);
        GLib.mkdir_with_parents(this.dir, 0o755);
        GLib.file_set_contents(path, svg);
        return path;
    }
}
