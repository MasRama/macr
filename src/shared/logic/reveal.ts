import type { Rect } from './geometry.js';

export interface Offset {
    x: number;
    y: number;
}

type Side = 'left' | 'right' | 'bottom';

/** Whether another monitor touches `monitor` on its left or right. */
function touched(monitor: Rect, monitors: readonly Rect[], side: 'left' | 'right'): boolean {
    return monitors.some((other) => {
        if (other === monitor) return false;
        const sideways = side === 'left' ? other.x + other.width === monitor.x : other.x === monitor.x + monitor.width;
        return sideways && other.y < monitor.y + monitor.height && monitor.y < other.y + other.height;
    });
}

/**
 * How far Show Desktop moves a window, as on macOS: to the nearer side edge
 * of its monitor, so only a `sliver` of it stays on screen. A side another
 * monitor touches is not used, as the window would show there; with both
 * sides taken it goes down instead. Never moves a window inwards.
 */
export function revealOffset(frame: Rect, monitor: Rect, monitors: readonly Rect[], sliver: number): Offset {
    const centre = frame.x + frame.width / 2;
    const nearer: 'left' | 'right' = centre < monitor.x + monitor.width / 2 ? 'left' : 'right';
    const other = nearer === 'left' ? 'right' : 'left';
    let side: Side = nearer;
    if (touched(monitor, monitors, nearer)) side = touched(monitor, monitors, other) ? 'bottom' : other;
    switch (side) {
        case 'left':
            return { x: Math.min(0, monitor.x + sliver - (frame.x + frame.width)), y: 0 };
        case 'right':
            return { x: Math.max(0, monitor.x + monitor.width - sliver - frame.x), y: 0 };
        case 'bottom':
            return { x: 0, y: Math.max(0, monitor.y + monitor.height - sliver - frame.y) };
    }
}

/** What still shows of `frame` moved by `offset`: its part inside `monitor`, or null. */
export function sliverOf(frame: Rect, offset: Offset, monitor: Rect): Rect | null {
    const x = Math.max(frame.x + offset.x, monitor.x);
    const y = Math.max(frame.y + offset.y, monitor.y);
    const right = Math.min(frame.x + offset.x + frame.width, monitor.x + monitor.width);
    const bottom = Math.min(frame.y + offset.y + frame.height, monitor.y + monitor.height);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
}
