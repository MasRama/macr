// Clipboard history, as macOS Tahoe keeps it: in memory, for eight hours.

export interface ClipMeta {
    /** Same key, same copy: copying it again moves it up instead of adding it. */
    key: string;
    kind: 'text' | 'image';
    /** The text copied; empty for an image. */
    text: string;
    /** When it was copied (ms). */
    at: number;
}

export const MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const MAX_CLIPS = 60;
/** Images are kept whole in memory to paste again, so fewer of them. */
export const MAX_IMAGES = 8;
const PREVIEW_LENGTH = 200;

/** Password managers (KeePassXC, KDE's) mark what should not be kept with this. */
const SECRET_HINT = 'x-kde-passwordManagerHint';
const TERMINALS = /terminal|console|ptyxis|kgx|kitty|alacritty|wezterm|foot|tilix|terminator|konsole|ghostty|blackbox|xterm|urxvt/i;

export function pruneClips<T extends ClipMeta>(list: T[], now: number): T[] {
    return list.filter((clip) => now - clip.at <= MAX_AGE_MS);
}

/** `clip` first, without an older copy of it, expired ones and those over the caps dropped. */
export function addClip<T extends ClipMeta>(list: T[], clip: T, now: number): T[] {
    let images = 0;
    return pruneClips([clip, ...list.filter((other) => other.key !== clip.key)], now)
        .filter((other) => other.kind !== 'image' || ++images <= MAX_IMAGES)
        .slice(0, MAX_CLIPS);
}

function squash(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** The clips whose text holds `query` (case and spacing ignored); everything for an empty query. */
export function searchClips<T extends ClipMeta>(list: T[], query: string): T[] {
    const wanted = squash(query).toLowerCase();
    if (!wanted) return list;
    return list.filter((clip) => clip.kind === 'text' && squash(clip.text).toLowerCase().includes(wanted));
}

/**
 * What to keep from a copy offering `mimetypes`: its text when it has any,
 * else an image (PNG when offered), else nothing. Nothing either when a
 * password manager marked it.
 */
export function clipKind(mimetypes: string[]): { kind: 'text' } | { kind: 'image'; mimetype: string } | null {
    if (mimetypes.includes(SECRET_HINT)) return null;
    if (mimetypes.some((type) => type.startsWith('text/plain') || type === 'UTF8_STRING' || type === 'STRING')) return { kind: 'text' };
    const images = mimetypes.filter((type) => type.startsWith('image/'));
    if (!images.length) return null;
    return { kind: 'image', mimetype: images.includes('image/png') ? 'image/png' : images[0] };
}

/** One line of the text, for the list. */
export function previewText(text: string): string {
    return squash(text).slice(0, PREVIEW_LENGTH);
}

export function ageOf(now: number, at: number): { unit: 'now' | 'minutes' | 'hours'; count: number } {
    const minutes = Math.floor((now - at) / 60_000);
    if (minutes < 1) return { unit: 'now', count: 0 };
    if (minutes < 60) return { unit: 'minutes', count: minutes };
    return { unit: 'hours', count: Math.floor(minutes / 60) };
}

/** The keys that paste in the app with this window class or app id. */
export function pasteKeys(app: string | null): 'ctrl-v' | 'ctrl-shift-v' {
    return app && TERMINALS.test(app) ? 'ctrl-shift-v' : 'ctrl-v';
}
