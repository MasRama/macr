export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Margins {
    top: number;
    right: number;
}

/**
 * Where the OSD sits in its monitor, as margins from the top right corner:
 * just under whatever the work area leaves out at the top (the menu bar),
 * and clear of anything reserved on the right, plus a gap.
 */
export function osdMargins(monitor: Rect, workArea: Rect, gap: number): Margins {
    const top = Math.max(0, workArea.y - monitor.y);
    const right = Math.max(0, monitor.x + monitor.width - (workArea.x + workArea.width));
    return { top: top + gap, right: right + gap };
}
