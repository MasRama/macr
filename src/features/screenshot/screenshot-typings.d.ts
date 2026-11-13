// @girs/gnome-shell 46.0.2 has no typings for ui/screenshot.js. These cover
// the parts of GNOME Shell 46's screenshot UI that the screenshot module uses.
// Everything starting with `_` is private to GNOME and checked before use.
declare module 'resource:///org/gnome/shell/ui/screenshot.js' {
    import type Cogl from 'gi://Cogl';
    import type Gio from 'gi://Gio';
    import St from 'gi://St';

    /** Saves a PNG of `texture` (or the `geometry` part of it), copies it and notifies. */
    export function captureScreenshot(
        texture: Cogl.Texture,
        geometry: [number, number, number, number] | null,
        scale: number,
        cursor: { texture: Cogl.Texture | null; x: number; y: number; scale: number } | null,
    ): Promise<Gio.File | undefined>;

    /** The selection rectangle and its handles. */
    export interface AreaSelector extends St.Widget {
        _startX: number;
        _startY: number;
        _lastX: number;
        _lastY: number;
        _dragButton: number;
        _updateSelectionRect(): void;
        getGeometry(): [number, number, number, number];
        stopDrag(): void;
    }

    /** One monitor's window picker. */
    export interface WindowSelector extends St.Widget {
        windows(): St.Button[];
    }

    /** `Main.screenshotUI`: built once at startup and never destroyed. */
    export class ScreenshotUI extends St.Widget {
        readonly screencast_in_progress: boolean;
        open(mode?: number): Promise<void>;
        close(instantly?: boolean): void;
        _panel: St.BoxLayout;
        _closeButton: St.Button;
        _typeButtonContainer: St.Widget;
        _bottomRowContainer: St.Widget;
        _selectionButton: St.Button;
        _screenButton: St.Button;
        _windowButton: St.Button;
        _shotButton: St.Button;
        _castButton: St.Button;
        _showPointerButton: St.Button;
        _captureButton: St.Button;
        _areaSelector: AreaSelector;
        _windowSelectors: WindowSelector[];
        _onCaptureButtonClicked(): void;
    }
}
