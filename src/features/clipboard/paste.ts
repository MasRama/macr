import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { pasteKeys } from './logic/history.js';

/** How long to wait for the app's window to take the keyboard back. */
const FOCUS_WAIT_MS = 600;
const FOCUS_POLL_MS = 20;

/**
 * Presses the focused app's paste keys (Ctrl+V, Ctrl+Shift+V in terminals)
 * on a virtual keyboard, as the on-screen keyboard types, once a window has
 * the focus back. Returns false when none does in time.
 */
export class Paster {
    private keyboard: Clutter.VirtualInputDevice | null = null;
    private waitId = 0;

    paste(done: (pasted: boolean) => void): void {
        this.cancel();
        let waited = 0;
        this.waitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_POLL_MS, () => {
            waited += FOCUS_POLL_MS;
            const window = global.display.focus_window;
            if (!window && waited < FOCUS_WAIT_MS) return GLib.SOURCE_CONTINUE;
            this.waitId = 0;
            if (window) this.press(pasteKeys(`${window.get_wm_class() ?? ''} ${window.get_gtk_application_id() ?? ''}`.trim() || null));
            done(!!window);
            return GLib.SOURCE_REMOVE;
        });
    }

    cancel(): void {
        if (this.waitId) GLib.source_remove(this.waitId);
        this.waitId = 0;
    }

    destroy(): void {
        this.cancel();
        this.keyboard = null;
    }

    private press(keys: 'ctrl-v' | 'ctrl-shift-v'): void {
        this.keyboard ??= Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const keyboard = this.keyboard;
        const held = keys === 'ctrl-shift-v' ? [Clutter.KEY_Control_L, Clutter.KEY_Shift_L] : [Clutter.KEY_Control_L];
        const send = (keyval: number, state: Clutter.KeyState) => keyboard.notify_keyval(GLib.get_monotonic_time(), keyval, state);
        for (const key of held) send(key, Clutter.KeyState.PRESSED);
        send(Clutter.KEY_v, Clutter.KeyState.PRESSED);
        send(Clutter.KEY_v, Clutter.KeyState.RELEASED);
        for (const key of [...held].reverse()) send(key, Clutter.KeyState.RELEASED);
    }
}
