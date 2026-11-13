import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { BorrowedKeys } from '../../shared/borrowed-keys.js';
import { hideApp, hideOthers } from '../../shared/hider.js';
import type { Module } from '../../shared/module.js';

/** The focused window, unless it is the desktop or a panel-like window. */
function focusedWindow(): Meta.Window | null {
    const window = global.display.focus_window;
    if (!window || window.skip_taskbar || window.get_window_type() === Meta.WindowType.DESKTOP) return null;
    return window;
}

function focusedApp(): Shell.App | null {
    const window = focusedWindow();
    return window ? Shell.WindowTracker.get_default().get_window_app(window) : null;
}

/** Each shortcut's setting and what it does. */
const SHORTCUTS: [string, () => void][] = [
    ['keyboard-quit', () => focusedApp()?.request_quit()],
    [
        'keyboard-minimize',
        () => {
            const window = focusedWindow();
            if (window?.can_minimize()) window.minimize();
        },
    ],
    [
        'keyboard-hide',
        () => {
            const app = focusedApp();
            if (app) hideApp(app);
        },
    ],
    ['keyboard-hide-others', () => hideOthers(focusedApp())],
];

/**
 * The Mac's Command shortcuts on Super: quit, minimize, hide and hide
 * others. GNOME binds Super+H to minimize and Super+M to the notification
 * list (Super+V still opens it); those lists lose only Macr's accelerators
 * while the module runs.
 */
export class KeyboardModule implements Module {
    private readonly borrowed: BorrowedKeys[];

    constructor(private readonly settings: Gio.Settings) {
        this.borrowed = [
            new BorrowedKeys(settings, 'keyboard-saved-wm', 'org.gnome.desktop.wm.keybindings', ['minimize']),
            new BorrowedKeys(settings, 'keyboard-saved-shell', 'org.gnome.shell.keybindings', ['toggle-message-tray']),
        ];
    }

    enable(): void {
        const ours = SHORTCUTS.flatMap(([key]) => this.settings.get_strv(key));
        for (const keys of this.borrowed) keys.take(ours);
        for (const [key, action] of SHORTCUTS)
            Main.wm.addKeybinding(key, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, action);
    }

    disable(): void {
        for (const [key] of SHORTCUTS) Main.wm.removeKeybinding(key);
        for (const keys of this.borrowed) keys.giveBack();
    }
}
