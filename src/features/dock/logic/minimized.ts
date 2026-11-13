// Minimized windows wait in the dock as thumbnails, as on macOS.

export interface MinimizedWindow {
    id: number;
    monitor: number;
    /** When it was minimized, as a count: older ones sit further from the Trash. */
    order: number;
}

/**
 * Which dock shows each minimized window, oldest first: the dock on its
 * monitor, else the primary monitor's, else the first dock.
 */
export function minimizedByDock(windows: readonly MinimizedWindow[], docks: readonly number[], primary: number): Map<number, number[]> {
    const byDock = new Map<number, number[]>(docks.map((monitor) => [monitor, []]));
    if (!docks.length) return byDock;
    const fallback = docks.includes(primary) ? primary : docks[0];
    for (const window of [...windows].sort((a, b) => a.order - b.order)) {
        byDock.get(docks.includes(window.monitor) ? window.monitor : fallback)!.push(window.id);
    }
    return byDock;
}

/** The size of a `width` × `height` window shrunk to fit a `side` square, keeping its shape. */
export function fitInSquare(width: number, height: number, side: number): { width: number; height: number } {
    if (width <= 0 || height <= 0) return { width: side, height: side };
    const scale = side / Math.max(width, height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
