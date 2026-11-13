import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import type { Module } from '../../shared/module.js';
import { isLight } from '../../shared/scheme.js';
import { type Accent, accentCss, accentName, wallpaperAccent } from './logic/accent.js';

/** The wallpaper is read this small: enough to tell its colours. */
const SAMPLE = 48;

function theme(): St.Theme {
    return St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).get_theme();
}

/**
 * The accent colour of Macr's own surfaces (menus, dialogs, Control Center,
 * Spotlight, Exposé, the Downloads stack, the screenshot toolbar): one of
 * the macOS accents, or the one the wallpaper suggests. A small generated
 * stylesheet in ~/.cache/macr re-colours Macr's accent rules; blue, the
 * look Macr ships, needs none.
 */
export class AccentModule implements Module {
    private readonly ids: [Gio.Settings, number][] = [];
    private background: Gio.Settings | null = null;
    private ui: Gio.Settings | null = null;
    private loaded: Gio.File | null = null;
    private accent: Accent = 'blue';
    private cancellable: Gio.Cancellable | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.background = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this.ui = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this.ids.push([this.settings, this.settings.connect('changed::accent-color', () => this.sync())]);
        for (const key of ['picture-uri', 'picture-uri-dark']) this.ids.push([this.background, this.background.connect(`changed::${key}`, () => this.sync())]);
        this.ids.push([this.ui, this.ui.connect('changed::color-scheme', () => this.sync())]);
        this.sync();
    }

    disable(): void {
        for (const [settings, id] of this.ids) settings.disconnect(id);
        this.ids.length = 0;
        this.cancellable?.cancel();
        this.cancellable = null;
        this.unload();
        this.accent = 'blue';
        this.background = null;
        this.ui = null;
    }

    private sync(): void {
        this.cancellable?.cancel();
        this.cancellable = null;
        const value = this.settings.get_string('accent-color');
        if (value === 'wallpaper') this.readWallpaper();
        else this.apply(accentName(value));
    }

    /** The picture GNOME draws now: the dark one under the dark style, when there is one. */
    private wallpaperUri(): string {
        const light = this.background?.get_string('picture-uri') ?? '';
        if (isLight()) return light;
        return this.background?.get_string('picture-uri-dark') || light;
    }

    private readWallpaper(): void {
        const uri = this.wallpaperUri();
        if (!uri) {
            this.apply('blue');
            return;
        }
        const cancellable = new Gio.Cancellable();
        this.cancellable = cancellable;
        const file = Gio.File.new_for_uri(uri);
        const fail = (error: unknown) => {
            if (cancellable.is_cancelled()) return;
            // A slideshow (XML) or a missing file: Macr's own blue.
            console.warn(`Macr: could not read the wallpaper's colours: ${error}`);
            this.apply('blue');
        };
        file.read_async(GLib.PRIORITY_LOW, cancellable, (_file, readResult) => {
            let stream: Gio.FileInputStream;
            try {
                stream = file.read_finish(readResult);
            } catch (error) {
                fail(error);
                return;
            }
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, SAMPLE, SAMPLE, true, cancellable, (_source, result) => {
                stream.close_async(GLib.PRIORITY_LOW, null, null);
                let pixbuf: GdkPixbuf.Pixbuf;
                try {
                    pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(result);
                } catch (error) {
                    fail(error);
                    return;
                }
                if (cancellable.is_cancelled() || this.cancellable !== cancellable) return;
                this.cancellable = null;
                this.apply(
                    wallpaperAccent({
                        pixels: pixbuf.get_pixels(),
                        width: pixbuf.get_width(),
                        height: pixbuf.get_height(),
                        rowstride: pixbuf.get_rowstride(),
                        channels: pixbuf.get_n_channels(),
                    }),
                );
            });
        });
    }

    private apply(accent: Accent): void {
        if (accent === this.accent && (accent === 'blue' || this.loaded)) return;
        this.unload();
        this.accent = accent;
        if (accent === 'blue') return;
        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'macr']);
        GLib.mkdir_with_parents(dir, 0o755);
        const file = Gio.File.new_for_path(GLib.build_filenamev([dir, `accent-${accent}.css`]));
        try {
            file.replace_contents(new TextEncoder().encode(accentCss(accent)), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            theme().load_stylesheet(file);
            this.loaded = file;
        } catch (error) {
            logError(error as object, 'Macr: could not load the accent colour');
        }
    }

    private unload(): void {
        if (this.loaded) theme().unload_stylesheet(this.loaded);
        this.loaded = null;
    }
}
