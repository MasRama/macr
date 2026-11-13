import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { addClip, type ClipMeta, clipKind, pruneClips } from './logic/history.js';

/** Bigger images are not kept: the history lives in memory. */
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
/** The thumbnail's longer side, in physical px at scale 1. */
const THUMBNAIL = 120;

export interface Clip extends ClipMeta {
    /** An image's bytes and type, to paste it again. */
    image: { bytes: GLib.Bytes; mimetype: string; thumbnail: GdkPixbuf.Pixbuf | null } | null;
}

/**
 * The history while the module is off for the lock screen, so locking does
 * not lose it. Turning the history off or `Macr.disable()` clears it.
 */
let kept: Clip[] = [];

export function resetClipboardHistory(): void {
    kept = [];
}

/** A thumbnail of `pixbuf` as content for an actor, kept in memory. */
export function thumbnailContent(pixbuf: GdkPixbuf.Pixbuf): St.ImageContent {
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const content = St.ImageContent.new_with_preferred_size(width, height) as St.ImageContent;
    const format = pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888;
    content.set_bytes(pixbuf.read_pixel_bytes(), format, width, height, pixbuf.get_rowstride());
    return content;
}

function thumbnail(bytes: GLib.Bytes): GdkPixbuf.Pixbuf | null {
    try {
        const loader = new GdkPixbuf.PixbufLoader();
        loader.write_bytes(bytes);
        loader.close();
        const pixbuf = loader.get_pixbuf();
        if (!pixbuf) return null;
        const ratio = Math.min(1, THUMBNAIL / Math.max(pixbuf.get_width(), pixbuf.get_height()));
        return pixbuf.scale_simple(Math.max(1, Math.round(pixbuf.get_width() * ratio)), Math.max(1, Math.round(pixbuf.get_height() * ratio)), GdkPixbuf.InterpType.BILINEAR);
    } catch {
        return null;
    }
}

/**
 * What was copied in the last eight hours, newest first, kept in memory
 * only. Every new clipboard owner is read: its text, else its image.
 * Copies a password manager marks as secret are skipped.
 */
export class ClipboardHistory {
    private clips: Clip[] = kept;
    private readonly selection = global.display.get_selection();
    private readonly clipboard = St.Clipboard.get_default();
    private readonly ownerId: number;
    /** Each read gets a number: a slow one finishing after a newer copy is dropped. */
    private reading = 0;

    constructor() {
        this.ownerId = this.selection.connect('owner-changed', (_selection: Meta.Selection, type: Meta.SelectionType) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD) this.read();
        });
    }

    /** The clips still in the history, newest first. */
    list(): Clip[] {
        this.clips = pruneClips(this.clips, Date.now());
        return this.clips;
    }

    remove(key: string): void {
        this.clips = this.clips.filter((clip) => clip.key !== key);
    }

    clear(): void {
        this.clips = [];
    }

    /** Stops following the clipboard; `keep` holds on to the history for the next one. */
    destroy(keep: boolean): void {
        this.selection.disconnect(this.ownerId);
        this.reading++;
        kept = keep ? this.clips : [];
        this.clips = [];
    }

    private read(): void {
        const reading = ++this.reading;
        const kind = clipKind(this.clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD));
        if (!kind) return;
        if (kind.kind === 'text') {
            this.clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
                if (reading !== this.reading || !text || !text.trim()) return;
                this.add({ key: `text:${text}`, kind: 'text', text, at: Date.now(), image: null });
            });
            return;
        }
        this.clipboard.get_content(St.ClipboardType.CLIPBOARD, kind.mimetype, (_clipboard, bytes) => {
            if (reading !== this.reading || !bytes) return;
            // St frees its GBytes once this callback returns, and GJS keeps no
            // reference of its own: a kept one points at freed memory (whose
            // size then reads as exabytes). Keep a copy instead.
            const size = bytes instanceof GLib.Bytes ? bytes.get_size() : bytes.length;
            if (!size || size > MAX_IMAGE_BYTES) return;
            const data = new GLib.Bytes(bytes instanceof GLib.Bytes ? bytes.toArray() : bytes.slice());
            const checksum = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA1, data);
            this.add({ key: `image:${checksum}`, kind: 'image', text: '', at: Date.now(), image: { bytes: data, mimetype: kind.mimetype, thumbnail: thumbnail(data) } });
        });
    }

    private add(clip: Clip): void {
        this.clips = addClip(this.clips, clip, clip.at);
    }
}
