/** A file in the screenshots folder and when it was last written, in milliseconds. */
export type FileStamp = { name: string; modified: number };

/**
 * The screenshot GNOME just saved, for captures that do not hand Macr the
 * file (Shift+Print, Alt+Print): the newest PNG written in the last `maxAge`
 * milliseconds. GNOME numbers a second file in the same second (`-1`), so on
 * a tie the longer name is the newer one.
 */
export function newestScreenshot(files: FileStamp[], now: number, maxAge = 10_000): string | null {
    let best: FileStamp | null = null;
    for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.png')) continue;
        if (now - file.modified > maxAge) continue;
        if (!best || newer(file, best)) best = file;
    }
    return best?.name ?? null;
}

function newer(a: FileStamp, b: FileStamp): boolean {
    if (a.modified !== b.modified) return a.modified > b.modified;
    if (a.name.length !== b.name.length) return a.name.length > b.name.length;
    return a.name > b.name;
}
