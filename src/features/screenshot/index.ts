import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { captureScreen, screenshotUI } from './capture.js';
import { QuickCapture } from './quick.js';

const SCREEN_KEY = 'screenshot-screen-shortcut';
const AREA_KEY = 'screenshot-area-shortcut';
const SHORTCUT_KEYS = [SCREEN_KEY, AREA_KEY];
/** POPUP too, so a menu that is open can be captured, as on macOS. */
const MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;

/**
 * macOS screenshots on top of GNOME's own screenshot UI: Super+Shift+3 takes
 * the whole screen at once, Super+Shift+4 a dragged area or a window. GNOME
 * saves, copies and notifies as usual, and Print, Shift+Print and Alt+Print
 * keep working.
 */
export class ScreenshotModule implements Module {
    private readonly settings: Gio.Settings;
    private quick: QuickCapture | null = null;

    constructor(context: ModuleContext) {
        this.settings = context.settings;
    }

    enable(): void {
        this.bind(SCREEN_KEY, () => this.captureScreen());
        // Without GNOME's UI as Macr knows it (not GNOME 46), only Super+Shift+3.
        const ui = screenshotUI();
        if (!ui) return;
        const quick = new QuickCapture(ui);
        this.quick = quick;
        this.bind(AREA_KEY, () => {
            if (!ui.visible) quick.open().catch((error) => logError(error, 'Macr: could not open the screenshot UI'));
        });
    }

    disable(): void {
        for (const key of SHORTCUT_KEYS) Main.wm.removeKeybinding(key);
        this.quick?.destroy();
        this.quick = null;
    }

    private bind(key: string, action: () => void): void {
        Main.wm.addKeybinding(key, this.settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, MODES, action);
    }

    /** Super+Shift+3. Not while the screenshot UI is open: it would be in the picture. */
    private captureScreen(): void {
        if (screenshotUI()?.visible) return;
        captureScreen().catch((error) => logError(error, 'Macr: could not take a screenshot'));
    }
}
