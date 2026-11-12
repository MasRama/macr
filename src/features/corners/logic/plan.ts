export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WindowShape {
    kind: 'normal' | 'dialog' | 'other';
    /** Everything the window draws, shadows and invisible borders included. */
    buffer: Rect;
    /** The visible window. */
    frame: Rect;
    /** Its title bar and borders are drawn by the window manager (X11). */
    serverDecorated: boolean;
    /** Maximized in either direction, which includes tiling. */
    maximized: boolean;
    fullscreen: boolean;
}

export interface CornerPlan {
    round: boolean;
    /** Macr draws a shadow behind it (the window has none of its own). */
    shadow: boolean;
    /** The visible window inside its buffer: x1, y1, x2, y2. */
    bounds: [number, number, number, number];
    radius: number;
}

const NONE: CornerPlan = { round: false, shadow: false, bounds: [0, 0, 0, 0], radius: 0 };

/**
 * Whether and how a window gets macOS corners. Client-decorated windows that
 * draw their own shadow (GTK, libadwaita) already shape their corners, so
 * they are left alone; rounding them would cut into that shadow.
 */
export function cornerPlan(window: WindowShape, radius: number): CornerPlan {
    if (radius <= 0 || window.kind === 'other' || window.maximized || window.fullscreen) return NONE;
    const { buffer, frame } = window;
    const margins = buffer.width !== frame.width || buffer.height !== frame.height;
    if (margins && !window.serverDecorated) return NONE;

    const x1 = frame.x - buffer.x;
    const y1 = frame.y - buffer.y;
    return {
        round: true,
        shadow: !window.serverDecorated,
        bounds: [x1, y1, x1 + frame.width, y1 + frame.height],
        radius: Math.min(radius, frame.width / 2, frame.height / 2),
    };
}
