import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { ScreenshotUI } from 'resource:///org/gnome/shell/ui/screenshot.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { captureScreen, screenshotUI } from './capture.js';
import { QuickCapture } from './quick.js';
import { Thumbnails } from './thumbnail.js';
import { Toolbar } from './toolbar.js';

const SCREEN_KEY = 'screenshot-screen-shortcut';
const AREA_KEY = 'screenshot-area-shortcut';
const TOOLBAR_KEY = 'screenshot-toolbar-shortcut';
const SHORTCUT_KEYS = [SCREEN_KEY, AREA_KEY, TOOLBAR_KEY];
/** POPUP too, so a menu that is open can be captured, as on macOS. */
const MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;
/** Shell.Screenshot's ways of taking the whole stage: Print, Shift+Print, Macr's keys, the D-Bus service. */
const STAGE_SHOTS = ['screenshot_stage_to_content', 'screenshot', 'screenshot_area'] as const;

type Shooter = Record<(typeof STAGE_SHOTS)[number], (...args: unknown[]) => unknown>;

/**
 * macOS screenshots on top of GNOME's own screenshot UI: Super+Shift+3 takes
 * the whole screen at once, Super+Shift+4 a dragged area or a window, and
 * Super+Shift+5 (or Print) shows GNOME's UI with the macOS toolbar. GNOME
 * saves, copies and notifies as usual, and Print, Shift+Print and Alt+Print
 * keep working. After each screenshot a floating thumbnail takes the place
 * of GNOME's banner.
 */
export class ScreenshotModule implements Module {
    private readonly settings: Gio.Settings;
    private quick: QuickCapture | null = null;
    private toolbar: Toolbar | null = null;
    private thumbnails: Thumbnails | null = null;
    /** Shell.Screenshot's methods as they were before Macr wrapped them, and Macr's wrappers. */
    private readonly shots = new Map<keyof Shooter, { original: Shooter[keyof Shooter]; wrapper: Shooter[keyof Shooter] }>();
    private takenId = 0;
    /** The UI whose `open` Macr wraps on the instance. */
    private wrapped: ScreenshotUI | null = null;

    constructor(context: ModuleContext) {
        this.settings = context.settings;
    }

    enable(): void {
        const thumbnails = new Thumbnails(this.settings);
        this.thumbnails = thumbnails;
        this.wrapShots();
        this.bind(SCREEN_KEY, () => this.captureScreen());
        // Without GNOME's UI as Macr knows it (not GNOME 46), only Super+Shift+3.
        const ui = screenshotUI();
        if (!ui) return;
        const toolbar = new Toolbar(ui);
        this.toolbar = toolbar;
        // Every way in (Print, the portal, Macr's keys) goes through open().
        const open = ui.open;
        ui.open = (...args: Parameters<ScreenshotUI['open']>) => {
            toolbar.syncScheme();
            return open.apply(ui, args);
        };
        this.wrapped = ui;
        this.takenId = ui.connect('screenshot-taken', (_ui: ScreenshotUI, file: Gio.File) => thumbnails.fileTaken(file));
        const quick = new QuickCapture(ui);
        this.quick = quick;
        const failed = (error: Error) => logError(error, 'Macr: could not open the screenshot UI');
        this.bind(AREA_KEY, () => {
            if (!ui.visible) quick.open().catch(failed);
        });
        this.bind(TOOLBAR_KEY, () => {
            if (!ui.visible) ui.open().catch(failed);
        });
    }

    disable(): void {
        for (const key of SHORTCUT_KEYS) Main.wm.removeKeybinding(key);
        // The quick capture first: it puts back what it hid over the toolbar's changes.
        this.quick?.destroy();
        this.quick = null;
        if (this.wrapped) {
            this.wrapped.disconnect(this.takenId);
            delete (this.wrapped as Partial<ScreenshotUI>).open;
        }
        this.takenId = 0;
        this.wrapped = null;
        this.toolbar?.destroy();
        this.toolbar = null;
        this.unwrapShots();
        this.thumbnails?.destroy();
        this.thumbnails = null;
    }

    private bind(key: string, action: () => void): void {
        Main.wm.addKeybinding(key, this.settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, MODES, action);
    }

    /** Super+Shift+3. Not while the screenshot UI is open: it would be in the picture. */
    private captureScreen(): void {
        if (screenshotUI()?.visible) return;
        captureScreen()
            .then((file) => this.thumbnails?.fileTaken(file))
            .catch((error) => logError(error, 'Macr: could not take a screenshot'));
    }

    /**
     * Takes the thumbnail away before anything shoots the stage, so it is
     * never in a screenshot. The wrappers sit on Shell.Screenshot's
     * prototype, where GNOME's ui/screenshot.js promisified them.
     */
    private wrapShots(): void {
        const proto = Shell.Screenshot.prototype as unknown as Shooter;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const module = this;
        for (const name of STAGE_SHOTS) {
            const original = proto[name];
            if (typeof original !== 'function') continue;
            const wrapper = function (this: unknown, ...args: unknown[]) {
                module.thumbnails?.dismiss();
                return original.apply(this, args);
            };
            this.shots.set(name, { original, wrapper });
            proto[name] = wrapper;
        }
    }

    /** Puts GNOME's methods back; a wrapper someone else wrapped again stays, doing nothing more. */
    private unwrapShots(): void {
        const proto = Shell.Screenshot.prototype as unknown as Shooter;
        for (const [name, { original, wrapper }] of this.shots) {
            if (proto[name] === wrapper) proto[name] = original;
        }
        this.shots.clear();
    }
}
