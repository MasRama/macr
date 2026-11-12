import type { Module } from '../../shared/module.js';
import { IconTiles } from './tiles.js';

/** macOS tiles for app icons that the icon theme does not cover. */
export class AppIconsModule implements Module {
    private tiles: IconTiles | null = null;

    enable(): void {
        this.tiles = new IconTiles();
    }

    disable(): void {
        this.tiles?.destroy();
        this.tiles = null;
    }
}
