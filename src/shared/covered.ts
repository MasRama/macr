import Meta from 'gi://Meta';

import { overlaps, type Rect } from './logic/geometry.js';

/** Window types that count as covering a chrome actor. */
const COVERING = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

/**
 * True when a window showing on the active workspace and on monitor
 * `monitorIndex` overlaps `rect` (stage coordinates). The dock and the Stage
 * Manager strip slide away while this holds.
 */
export function windowCovers(rect: Rect, monitorIndex: number): boolean {
    const workspace = global.workspace_manager.get_active_workspace();
    return global
        .get_window_actors()
        .map((actor) => actor.meta_window)
        .some(
            (window) =>
                !window.minimized &&
                window.showing_on_its_workspace() &&
                window.located_on_workspace(workspace) &&
                window.get_monitor() === monitorIndex &&
                COVERING.includes(window.get_window_type()) &&
                overlaps(rect, window.get_frame_rect()),
        );
}
