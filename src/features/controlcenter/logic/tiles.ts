/**
 * The Control Center tiles a user can show or hide (Macr's settings,
 * `control-center-hidden`), in the order the settings list them.
 */
export const TILES = ['wifi', 'bluetooth', 'focus', 'stage-manager', 'now-playing', 'airplane-mode', 'night-light', 'dark-style', 'power-mode', 'display', 'sound', 'microphone'] as const;
export type TileId = (typeof TILES)[number];

/** The tiles the saved list hides. */
export function hiddenTiles(saved: readonly string[]): Set<TileId> {
    return new Set(TILES.filter((tile) => saved.includes(tile)));
}

/** The saved list with `tile` shown or hidden. */
export function withTile(saved: readonly string[], tile: TileId, shown: boolean): string[] {
    const others = saved.filter((entry) => entry !== tile);
    return shown ? others : [...others, tile];
}
