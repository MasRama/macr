/** A desktop's wallpaper: GNOME's picture-uri and picture-uri-dark. */
export interface Wallpaper {
    light: string;
    dark: string;
}

/** Each desktop's own wallpaper; null follows Desktop 1's. */
export type OwnWallpapers = (Wallpaper | null)[];

export function sameWallpaper(a: Wallpaper, b: Wallpaper): boolean {
    return a.light === b.light && a.dark === b.dark;
}

function isEmpty(wallpaper: Wallpaper | undefined): boolean {
    return !wallpaper || (!wallpaper.light && !wallpaper.dark);
}

/**
 * The desktops' wallpapers as Macr starts. GNOME's own wallpaper is Desktop
 * 1's: Macr puts Desktop 1's back when it stops, so a different one was
 * picked while Macr was off. The other desktops get back what was saved.
 */
export function startWallpapers(saved: Wallpaper[], current: Wallpaper, count: number): OwnWallpapers {
    const own: OwnWallpapers = [current];
    for (let index = 1; index < count; index++) {
        const wallpaper = saved[index];
        own.push(wallpaper && !isEmpty(wallpaper) && !sameWallpaper(wallpaper, current) ? wallpaper : null);
    }
    return own;
}

/** What a desktop shows: its own wallpaper, or Desktop 1's. */
export function shownWallpaper(own: OwnWallpapers, index: number): Wallpaper {
    return own[index] ?? (own[0] as Wallpaper);
}

/** As GSettings keeps them, a(ss); empty strings follow Desktop 1. */
export function toSaved(own: OwnWallpapers): [string, string][] {
    return own.map((wallpaper) => [wallpaper?.light ?? '', wallpaper?.dark ?? '']);
}

export function fromSaved(saved: [string, string][]): Wallpaper[] {
    return saved.map(([light, dark]) => ({ light, dark }));
}
