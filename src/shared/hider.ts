import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { hideTargets, unhideTargets } from './logic/hide.js';

/** `skipNextEffect` is public in GNOME 46 but has no typing. */
type WindowManager = { skipNextEffect(actor: Meta.WindowActor): void };

/** Windows Hide minimized, with their app, until that app gets focus again. */
const hidden = new Map<Meta.Window, Shell.App>();
const unmanagedIds = new Map<Meta.Window, number>();
let focusId = 0;

/** The app's normal windows. */
function normalWindows(app: Shell.App): Meta.Window[] {
    return app.get_windows().filter((w) => !w.skip_taskbar && w.get_window_type() === Meta.WindowType.NORMAL);
}

/**
 * macOS hides and shows apps without an animation. Only skips an effect
 * that will play: the window is shown now when hiding, or will show on this
 * workspace when coming back; a skip that never plays would eat the next one.
 */
function quietly(window: Meta.Window, hiding: boolean): void {
    const actor = window.get_compositor_private() as Meta.WindowActor | null;
    if (!actor) return;
    const plays = hiding ? actor.visible : !actor.visible && window.located_on_workspace(global.workspace_manager.get_active_workspace());
    if (plays) (Main.wm as unknown as WindowManager).skipNextEffect(actor);
}

function remember(window: Meta.Window, app: Shell.App): void {
    hidden.set(window, app);
    if (!unmanagedIds.has(window)) unmanagedIds.set(window, window.connect('unmanaged', () => forget(window)));
    if (!focusId) focusId = Shell.WindowTracker.get_default().connect('notify::focus-app', () => unhideFocused());
}

function forget(window: Meta.Window): void {
    hidden.delete(window);
    const id = unmanagedIds.get(window);
    if (id !== undefined) window.disconnect(id);
    unmanagedIds.delete(window);
    if (hidden.size === 0 && focusId) {
        Shell.WindowTracker.get_default().disconnect(focusId);
        focusId = 0;
    }
}

/** The app that got focus brings back the rest of what Hide minimized. */
function unhideFocused(): void {
    const app = Shell.WindowTracker.get_default().focus_app;
    for (const window of unhideTargets(hidden, app, (w) => w.minimized)) {
        quietly(window, false);
        window.unminimize();
    }
    for (const [window, owner] of [...hidden]) if (owner === app) forget(window);
}

/** Hides the app as macOS does: all its windows minimized, without an animation. */
export function hideApp(app: Shell.App): void {
    const windows = normalWindows(app).map((window) => ({ window, minimized: window.minimized, canMinimize: window.can_minimize() }));
    for (const { window } of hideTargets(windows)) {
        quietly(window, true);
        window.minimize();
        remember(window, app);
    }
}

/** Hides every running app but `keep`. */
export function hideOthers(keep: Shell.App | null): void {
    for (const app of Shell.AppSystem.get_default().get_running()) if (app !== keep) hideApp(app);
}

/** Brings back every minimized window of every app. */
export function showAll(): void {
    resetHider();
    for (const app of Shell.AppSystem.get_default().get_running()) {
        for (const window of normalWindows(app)) if (window.minimized) window.unminimize();
    }
}

/** Forgets what was hidden; the windows stay minimized. */
export function resetHider(): void {
    for (const window of [...hidden.keys()]) forget(window);
}
