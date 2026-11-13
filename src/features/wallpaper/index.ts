import { releaseDesktopReveal, useDesktopReveal } from '../../shared/desktop-reveal.js';
import type { Module } from '../../shared/module.js';
import { WallpaperClick } from './wallpaper-click.js';

/** Click the wallpaper to reveal the desktop. */
export class WallpaperClickModule implements Module {
    private click: WallpaperClick | null = null;

    enable(): void {
        this.click = new WallpaperClick(useDesktopReveal());
    }

    disable(): void {
        this.click?.destroy();
        this.click = null;
        releaseDesktopReveal();
    }
}
