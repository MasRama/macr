import type Cogl from 'gi://Cogl';
import type Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { captureScreenshot, type ScreenshotUI } from 'resource:///org/gnome/shell/ui/screenshot.js';

/** What `screenshot_stage_to_content` resolves to once ui/screenshot.js promisified it. */
type StageShooter = { screenshot_stage_to_content(): Promise<[{ get_texture(): Cogl.Texture }, number]> };

/** GNOME's screenshot UI, when it has every part Macr uses (GNOME 46). */
export function screenshotUI(): ScreenshotUI | null {
    const ui = (Main as unknown as { screenshotUI?: ScreenshotUI }).screenshotUI;
    if (!ui) return null;
    const parts = ['_panel', '_closeButton', '_typeButtonContainer', '_bottomRowContainer', '_selectionButton', '_screenButton', '_windowButton', '_castButton', '_showPointerButton', '_areaSelector', '_windowSelectors', '_onCaptureButtonClicked'] as const;
    return parts.every((part) => ui[part] !== undefined) ? ui : null;
}

/**
 * The whole screen, at once and without the UI, as GNOME's Shift+Print
 * takes it: saved, copied and notified by GNOME's own `captureScreenshot`.
 */
export async function captureScreen(): Promise<Gio.File | null> {
    const shooter = new Shell.Screenshot() as unknown as StageShooter;
    const [content] = await shooter.screenshot_stage_to_content();
    return (await captureScreenshot(content.get_texture(), null, 1, null)) ?? null;
}
