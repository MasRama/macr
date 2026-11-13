// Where the dock sits on its monitor: along the bottom, or down the left or
// right side, as in macOS's "Position on screen".

import type { Rect } from '../../../shared/logic/geometry.js';

export type DockEdge = 'bottom' | 'left' | 'right';

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

/** The dock-position setting, read safely. */
export function parseEdge(value: string): DockEdge {
    return value === 'left' || value === 'right' ? value : 'bottom';
}

/** A dock down a side is a column; along the bottom a row. */
export function isSide(edge: DockEdge): boolean {
    return edge !== 'bottom';
}

export interface DockLayout {
    /** Where the dock actor goes, in stage coordinates. */
    actor: Point;
    /** Where the shelf (dash and background) sits inside the actor. */
    shelf: Point;
    /** The actor's area that keeps the pointer "on" the dock, out to the screen edge. */
    hit: Rect;
    /** The shelf at rest, in stage coordinates. */
    resting: Rect;
    /** The one-pixel strip along the screen edge that brings a hidden dock back. */
    strip: Rect;
    /** How far the dock slides to hide past its edge. */
    hidden: Point;
}

/** The dock's shelf of `size`, centred along `edge`, `margin` from it. */
export function dockLayout(edge: DockEdge, monitor: Rect, size: Size, margin: number): DockLayout {
    const { width, height } = size;
    const away = (side: number) => side + margin + 4;
    if (edge === 'bottom') {
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = Math.round(monitor.y + monitor.height - height - margin);
        return {
            actor: { x, y },
            shelf: { x: 0, y: 0 },
            hit: { x: 0, y: 0, width, height: height + margin },
            resting: { x, y, width, height },
            strip: { x, y: monitor.y + monitor.height - 1, width, height: 1 },
            hidden: { x: 0, y: away(height) },
        };
    }
    const y = Math.round(monitor.y + (monitor.height - height) / 2);
    if (edge === 'left') {
        const x = monitor.x;
        return {
            actor: { x, y },
            shelf: { x: margin, y: 0 },
            hit: { x: 0, y: 0, width: width + margin, height },
            resting: { x: x + margin, y, width, height },
            strip: { x, y, width: 1, height },
            hidden: { x: -away(width), y: 0 },
        };
    }
    const x = Math.round(monitor.x + monitor.width - width - margin);
    return {
        actor: { x, y },
        shelf: { x: 0, y: 0 },
        hit: { x: 0, y: 0, width: width + margin, height },
        resting: { x, y, width, height },
        strip: { x: monitor.x + monitor.width - 1, y, width: 1, height },
        hidden: { x: away(width), y: 0 },
    };
}

/** The point of an icon that stays put as it grows away from the edge. */
export function growPivot(edge: DockEdge): [number, number] {
    if (edge === 'left') return [0, 0.5];
    if (edge === 'right') return [1, 0.5];
    return [0.5, 1];
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/**
 * Where an item's label goes: over it on a bottom dock, beside it on a side
 * dock, past the `grown` px its icon is magnified by, kept on the `stage`.
 */
export function labelPlace(edge: DockEdge, item: Rect, grown: number, label: Size, gap: number, stage: Size): Point {
    if (edge === 'bottom') {
        const x = clamp(Math.floor(item.x + (item.width - label.width) / 2), 0, stage.width - label.width);
        return { x, y: item.y - grown - label.height - gap };
    }
    const y = clamp(Math.floor(item.y + (item.height - label.height) / 2), 0, stage.height - label.height);
    const x = edge === 'left' ? item.x + item.width + grown + gap : item.x - grown - label.width - gap;
    return { x, y };
}

export interface PanelPlace extends Point {
    /** The panel's point nearest the icon, to grow from. */
    pivot: [number, number];
}

/**
 * Where a panel (a stack's grid) opens from the dock icon at `icon`: above
 * it on a bottom dock, beside it on a side dock, `gap` away, at least
 * `margin` inside the `monitor` (all in the monitor's coordinates).
 */
export function panelPlace(edge: DockEdge, icon: Rect, panel: Size, monitor: Size, gap: number, margin: number): PanelPlace {
    const centerX = icon.x + icon.width / 2;
    const centerY = icon.y + icon.height / 2;
    if (edge === 'bottom') {
        const x = clamp(centerX - panel.width / 2, margin, monitor.width - panel.width - margin);
        return { x, y: icon.y - panel.height - gap, pivot: [clamp((centerX - x) / panel.width, 0, 1), 1] };
    }
    const y = clamp(centerY - panel.height / 2, margin, monitor.height - panel.height - margin);
    const pivotY = clamp((centerY - y) / panel.height, 0, 1);
    if (edge === 'left') return { x: icon.x + icon.width + gap, y, pivot: [0, pivotY] };
    return { x: icon.x - panel.width - gap, y, pivot: [1, pivotY] };
}
