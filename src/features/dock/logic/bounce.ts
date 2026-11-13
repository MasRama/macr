// A dock icon bouncing, as on macOS: while its app opens, and a few times
// when the app asks for attention.

import type { DockEdge } from './edge.js';

/** One bounce, up and back down, in ms. */
export const BOUNCE_TIME = 640;
/** How high an icon bounces, as a share of its size. */
export const BOUNCE_HEIGHT = 0.5;
/** Bounces when an app asks for attention. */
export const ATTENTION_BOUNCES = 3;
/** An app that never finishes opening stops bouncing after this long, in ms. */
export const LAUNCH_LIMIT = 12000;

export type BounceKind = 'launch' | 'attention';

/**
 * How far off the shelf the icon is `progress` (0 to 1) through a bounce
 * of `height` px: thrown up and falling back, a parabola.
 */
export function bounceOffset(progress: number, height: number): number {
    const p = Math.max(0, Math.min(1, progress));
    return height * 4 * p * (1 - p);
}

/** The translation that lifts an icon `offset` px away from the dock's `edge`. */
export function bounceShift(edge: DockEdge, offset: number): [number, number] {
    if (edge === 'left') return [offset, 0];
    if (edge === 'right') return [-offset, 0];
    return [0, -offset];
}

export interface BounceState {
    kind: BounceKind;
    /** Bounces finished so far. */
    done: number;
    /** Time since the first bounce began, in ms. */
    elapsed: number;
    /** The app is still opening. */
    starting: boolean;
}

/** Whether another bounce follows the one that just finished. */
export function keepBouncing(state: BounceState): boolean {
    if (state.kind === 'attention') return state.done < ATTENTION_BOUNCES;
    return state.starting && state.elapsed < LAUNCH_LIMIT;
}
