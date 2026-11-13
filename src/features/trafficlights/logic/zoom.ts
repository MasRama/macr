// The menu macOS shows while the pointer rests on a window's green light.
// The app draws the light, so the shell finds it from the window's frame.

import { type Arrangement, arrangement } from '../../../shared/logic/arrange.js';
import { placeWindow, type Placement, type Rect } from '../../../shared/logic/geometry.js';

/**
 * Where the green light is, from the frame's top left corner in logical px:
 * Macr's lights are 20 px apart, and the green one's centre was measured at
 * 55.5, 22.5 in libadwaita apps and 52.5, 21.5 in GTK 3 ones.
 */
const GREEN = { x: 54, y: 22 };
/** Half the side of the square that counts as on the light. */
const REACH = 9;

/** How long the pointer rests on the light before the menu shows, as on macOS. */
export const DWELL_MS = 600;

export function greenLightZone(frame: Rect): Rect {
    return { x: frame.x + GREEN.x - REACH, y: frame.y + GREEN.y - REACH, width: 2 * REACH, height: 2 * REACH };
}

export function inside(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export interface WindowFacts {
    /** A normal app window, not a dialog. */
    normal: boolean;
    fullscreen: boolean;
    /** A GTK app: it draws its own title bar with Macr's lights. */
    gtk: boolean;
    /** An X11 window in the frame Mutter draws, also with Macr's lights. */
    x11Framed: boolean;
}

/** Windows whose lights are where `greenLightZone` looks. */
export function drawsLights(window: WindowFacts): boolean {
    return window.normal && !window.fullscreen && (window.gtk || window.x11Framed);
}

/**
 * The parts of a `width` by `height` screen glyph a menu item fills: the
 * window's, then its partner's for an arrangement.
 */
export function glyphParts(kind: Placement | Arrangement, width: number, height: number, gap: number): Rect[] {
    const screen = { x: 0, y: 0, width, height };
    const placements: Placement[] = isArrangement(kind) ? arrangement(kind) : [kind as Placement];
    return placements.map((placement) => placeWindow(placement, screen, screen, gap));
}

function isArrangement(kind: string): kind is Arrangement {
    return kind === 'left-right' || kind === 'right-left' || kind === 'top-bottom' || kind === 'bottom-top';
}
