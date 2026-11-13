import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type { ScreenshotUI } from 'resource:///org/gnome/shell/ui/screenshot.js';

import { isSelection, spaceSwitchesTo, type Point } from './logic/quick.js';

const QUICK = 'macr-screenshot-quick';
/** Where the selection is parked, off the stage, so every press starts a new one. */
const PARKED = -1000;
/** The smallest selection that is captured, in logical pixels each way. */
const MIN_SIZE = 4;
const ENTER = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter];
const ARROWS = [Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Up, Clutter.KEY_Down];

/** What the quick capture changed in GNOME's UI, to put back when it closes. */
type Saved = { type: St.Button; area: [number, number, number, number] };

/**
 * Super+Shift+4: GNOME's screenshot UI with no panel and no shade, straight
 * into a crosshair. Releasing a drag captures it; Space switches to GNOME's
 * window picker, where a click captures the window, and back; Escape
 * cancels. GNOME's last capture type and selection come back on close.
 */
export class QuickCapture {
    private readonly uiIds: number[];
    private readonly areaIds: number[];
    private saved: Saved | null = null;
    private dragStart: Point | null = null;
    private active = false;

    constructor(private readonly ui: ScreenshotUI) {
        const area = ui._areaSelector;
        this.areaIds = [
            area.connect('drag-started', () => {
                if (this.active) this.dragStart = { x: area._startX, y: area._startY };
            }),
            area.connect('drag-ended', () => this.onDragEnded()),
        ];
        this.uiIds = [
            ui.connect('captured-event', (_ui: Clutter.Actor, event: Clutter.Event) => this.onEvent(event)),
            ui.connect('closed', () => this.finish()),
        ];
    }

    destroy(): void {
        if (this.active && this.ui.visible) this.ui.close(true);
        this.finish();
        for (const id of this.uiIds) this.ui.disconnect(id);
        for (const id of this.areaIds) this.ui._areaSelector.disconnect(id);
    }

    async open(): Promise<void> {
        const ui = this.ui;
        if (ui.visible || this.active) return;
        const area = ui._areaSelector;
        const type = [ui._selectionButton, ui._screenButton, ui._windowButton].find((button) => button.checked) ?? ui._selectionButton;
        this.saved = { type, area: [area._startX, area._startY, area._lastX, area._lastY] };
        this.active = true;
        ui.add_style_class_name(QUICK);
        ui._panel.hide();
        ui._closeButton.hide();
        ui._selectionButton.checked = true;
        this.park();

        try {
            await ui.open();
        } catch (error) {
            this.finish();
            throw error;
        }
        // open() returns early while a screencast runs or another open is under way.
        if (!this.active) return;
        if (!ui.visible) {
            this.finish();
            return;
        }
        // GNOME destroys these windows when the UI closes.
        for (const window of ui._windowSelectors.flatMap((selector) => selector.windows())) {
            window.connect('clicked', () => {
                if (this.active && window.checked) ui._onCaptureButtonClicked();
            });
        }
    }

    private finish(): void {
        if (!this.active) return;
        this.active = false;
        this.dragStart = null;
        const ui = this.ui;
        ui.remove_style_class_name(QUICK);
        ui._panel.show();
        ui._closeButton.show();
        const saved = this.saved;
        this.saved = null;
        if (!saved) return;
        saved.type.checked = true;
        const area = ui._areaSelector;
        [area._startX, area._startY, area._lastX, area._lastY] = saved.area;
        area._updateSelectionRect();
    }

    /** Moves GNOME's selection off the stage, so a press anywhere draws a new one. */
    private park(): void {
        const area = this.ui._areaSelector;
        area._startX = area._lastX = PARKED;
        area._startY = area._lastY = PARKED;
        area._updateSelectionRect();
    }

    private onDragEnded(): void {
        if (!this.active) return;
        const start = this.dragStart;
        this.dragStart = null;
        const [x, y] = global.get_pointer();
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        if (start && isSelection(start, { x, y }, MIN_SIZE * scale)) this.ui._onCaptureButtonClicked();
        else this.park();
    }

    /**
     * Space switches mode; Escape, the arrows and (in the window picker)
     * Enter keep GNOME's meaning. GNOME's other keys (S, C, W, P, V, Enter on
     * a selection that is not there) are swallowed: they belong to its panel.
     */
    private onEvent(event: Clutter.Event): boolean {
        if (!this.active || event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
        const ui = this.ui;
        const symbol = event.get_key_symbol();
        const picking = ui._windowButton.checked;
        if (symbol === Clutter.KEY_Escape || ARROWS.includes(symbol)) return Clutter.EVENT_PROPAGATE;
        if (picking && ENTER.includes(symbol)) return Clutter.EVENT_PROPAGATE;
        if (symbol === Clutter.KEY_space && !ui._areaSelector._dragButton) {
            if (spaceSwitchesTo(picking ? 'window' : 'selection', ui._windowButton.reactive) === 'window') {
                ui._windowButton.checked = true;
            } else {
                ui._selectionButton.checked = true;
                this.park();
            }
        }
        return Clutter.EVENT_STOP;
    }
}
