import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { coverSize, isPhoto, photoFor } from './logic/photos.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** Looks this many folders deep into Pictures, and stops after this many photos. */
const MAX_DEPTH = 3;
const MAX_PHOTOS = 2000;
/** Checks for the next photo this often (seconds). */
const TICK_SECONDS = 5 * 60;
/** Reads Pictures again this often (seconds). */
const RESCAN_SECONDS = 60 * 60;
const ATTRIBUTES = 'standard::name,standard::type,standard::content-type,standard::is-hidden';

/**
 * The macOS Photos widget: one of your pictures, filling the widget, a new
 * one every few hours. Photos come from the XDG Pictures folder; a click
 * opens the picture.
 */
export class PhotosWidget extends DesktopWidget {
    private readonly empty: St.Label;
    private readonly cancellable = new Gio.Cancellable();
    private photos: string[] = [];
    private shown: string | null = null;
    private cached: string | null = null;
    private timerId = 0;
    private scannedAt = 0;

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        this.actor.add_style_class_name('macr-widget-photos');
        this.empty = new St.Label({
            text: _('Add photos to your Pictures folder'),
            style_class: 'macr-widget-photos-empty',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.empty.clutter_text.line_wrap = true;
        this.empty.hide();
        this.actor.add_child(this.empty);
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, TICK_SECONDS, () => {
            if (GLib.get_monotonic_time() / 1e6 - this.scannedAt > RESCAN_SECONDS) void this.scan();
            else void this.show();
            return GLib.SOURCE_CONTINUE;
        });
        void this.scan();
    }

    override destroy(): void {
        this.cancellable.cancel();
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        this.dropCached();
        super.destroy();
    }

    protected activate(): void {
        if (!this.shown) {
            const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
            if (pictures) Gio.AppInfo.launch_default_for_uri_async(Gio.File.new_for_path(pictures).get_uri(), null, null, null);
            return;
        }
        Gio.AppInfo.launch_default_for_uri_async(Gio.File.new_for_path(this.shown).get_uri(), null, null, null);
    }

    /** Lists the photos in Pictures, off the main loop. */
    private async scan(): Promise<void> {
        this.scannedAt = GLib.get_monotonic_time() / 1e6;
        const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        const found: string[] = [];
        if (pictures && pictures !== GLib.get_home_dir()) {
            try {
                await this.walk(Gio.File.new_for_path(pictures), 0, found);
            } catch (error) {
                if (this.cancelled(error)) return;
                console.warn(`Macr: Photos widget: ${error}`);
            }
        }
        found.sort();
        this.photos = found;
        await this.show();
    }

    private async walk(folder: Gio.File, depth: number, found: string[]): Promise<void> {
        const enumerator = await enumerate(folder, this.cancellable);
        for (;;) {
            const infos = await nextFiles(enumerator, this.cancellable);
            if (infos.length === 0) break;
            for (const info of infos) {
                if (found.length >= MAX_PHOTOS) return;
                const name = info.get_name();
                if (info.get_is_hidden() || name.startsWith('.')) continue;
                const child = folder.get_child(name);
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    if (depth < MAX_DEPTH) await this.walk(child, depth + 1, found).catch((error: unknown) => {
                        if (this.cancelled(error)) throw error;
                    });
                } else if (isPhoto(name, info.get_content_type() ?? '')) {
                    const path = child.get_path();
                    if (path) found.push(path);
                }
            }
        }
        enumerator.close_async(GLib.PRIORITY_LOW, null, null);
    }

    /** Shows this period's photo, when it is not the one shown. */
    private async show(): Promise<void> {
        const path = photoFor(this.photos, Math.floor(Date.now() / 1000));
        this.empty.visible = path === null;
        if (path === null) {
            this.shown = null;
            this.actor.set_style(null);
            this.dropCached();
            return;
        }
        if (path === this.shown) return;
        try {
            const file = await this.render(path);
            if (this.cancellable.is_cancelled()) return;
            this.shown = path;
            const old = this.cached;
            this.cached = file;
            // St draws a background image inside the rounded corners.
            this.actor.set_style(`background-image: url("${GLib.filename_to_uri(file, null)}"); background-size: cover;`);
            if (old) GLib.unlink(old);
        } catch (error) {
            if (this.cancelled(error)) return;
            console.warn(`Macr: Photos widget: ${path}: ${error}`);
            // Try the next photo next time rather than this one again.
            this.photos = this.photos.filter((p) => p !== path);
        }
    }

    /**
     * The photo scaled to cover the widget, turned upright and cropped to it,
     * as a small PNG in Macr's cache: the theme loads it without stalling.
     */
    private async render(path: string): Promise<string> {
        const { width: boxWidth, height: boxHeight } = this.box;
        const [format, width, height] = await fileInfo(path, this.cancellable);
        if (!format || width <= 0 || height <= 0) throw new Error('not a picture');
        // Covering a square of the widget's longer side, the photo still
        // covers it once EXIF turns it upright, whichever way.
        const longer = Math.max(boxWidth, boxHeight);
        const target = coverSize(width, height, longer, longer);
        const stream = await readFile(Gio.File.new_for_path(path), this.cancellable);
        let pixbuf = await loadAtScale(stream, target.width, target.height, this.cancellable);
        stream.close(null);
        pixbuf = pixbuf.apply_embedded_orientation() ?? pixbuf;
        const cropWidth = Math.min(pixbuf.get_width(), boxWidth);
        const cropHeight = Math.min(pixbuf.get_height(), boxHeight);
        const cropped = pixbuf.new_subpixbuf(Math.floor((pixbuf.get_width() - cropWidth) / 2), Math.floor((pixbuf.get_height() - cropHeight) / 2), cropWidth, cropHeight);
        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'macr']);
        GLib.mkdir_with_parents(dir, 0o700);
        // A new name each time: the theme keeps images by file name.
        const file = GLib.build_filenamev([dir, `photo-widget-${GLib.get_real_time()}.png`]);
        cropped.savev(file, 'png', [], []);
        return file;
    }

    private dropCached(): void {
        if (this.cached) GLib.unlink(this.cached);
        this.cached = null;
    }

    private cancelled(error: unknown): boolean {
        return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    }
}

/**
 * Pictures a widget left in the cache when the shell stopped without
 * disabling it. Called once as the module starts: gallery previews must not
 * take the desktop widget's picture away.
 */
export function removeOldPictures(): void {
    const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'macr']);
    let listing: GLib.Dir;
    try {
        listing = GLib.Dir.open(dir, 0);
    } catch {
        return;
    }
    for (let name = listing.read_name(); name !== null; name = listing.read_name()) {
        if (name.startsWith('photo-widget-') && name.endsWith('.png')) GLib.unlink(GLib.build_filenamev([dir, name]));
    }
    listing.close();
}

function enumerate(folder: Gio.File, cancellable: Gio.Cancellable): Promise<Gio.FileEnumerator> {
    return new Promise((resolve, reject) => {
        folder.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, cancellable, (_source, result) => {
            try {
                resolve(folder.enumerate_children_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function nextFiles(enumerator: Gio.FileEnumerator, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[]> {
    return new Promise((resolve, reject) => {
        enumerator.next_files_async(100, GLib.PRIORITY_LOW, cancellable, (_source, result) => {
            try {
                resolve(enumerator.next_files_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function fileInfo(path: string, cancellable: Gio.Cancellable): Promise<[GdkPixbuf.PixbufFormat | null, number, number]> {
    return new Promise((resolve, reject) => {
        GdkPixbuf.Pixbuf.get_file_info_async(path, cancellable, (_source, result) => {
            try {
                resolve(GdkPixbuf.Pixbuf.get_file_info_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function readFile(file: Gio.File, cancellable: Gio.Cancellable): Promise<Gio.FileInputStream> {
    return new Promise((resolve, reject) => {
        file.read_async(GLib.PRIORITY_LOW, cancellable, (_source, result) => {
            try {
                resolve(file.read_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function loadAtScale(stream: Gio.InputStream, width: number, height: number, cancellable: Gio.Cancellable): Promise<GdkPixbuf.Pixbuf> {
    return new Promise((resolve, reject) => {
        GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, width, height, false, cancellable, (_source, result) => {
            try {
                resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}
