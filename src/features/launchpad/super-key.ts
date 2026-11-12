import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ZORIN_MENU = 'org.gnome.shell.extensions.zorin-menu';

/**
 * Makes the Super key call `onPress` instead of opening the overview. The
 * overview's handler is blocked, not removed (Zorin Menu does the same), and
 * Zorin Menu's own Super binding is switched off meanwhile and put back by
 * destroy().
 */
export class SuperKey {
    private readonly blocked: number;
    private readonly id: number;
    private readonly zorin: Gio.Settings | null = null;

    constructor(onPress: () => void) {
        const schema = Gio.SettingsSchemaSource.get_default()?.lookup(ZORIN_MENU, true);
        if (schema?.has_key('super-hotkey')) {
            const zorin = new Gio.Settings({ schema_id: ZORIN_MENU });
            if (zorin.get_boolean('super-hotkey')) {
                zorin.set_boolean('super-hotkey', false);
                this.zorin = zorin;
            }
        }
        const signalId = GObject.signal_lookup('overlay-key', Meta.Display.$gtype);
        // The first handler is the shell's own, connected at startup.
        this.blocked = GObject.signal_handler_find(global.display, GObject.SignalMatchType.ID, signalId, 0, null, null, null);
        if (this.blocked) GObject.signal_handler_block(global.display, this.blocked);
        this.id = global.display.connect('overlay-key', () => onPress());
        // Super closes Launchpad again while it holds the keyboard.
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP);
    }

    destroy(): void {
        global.display.disconnect(this.id);
        if (this.blocked) GObject.signal_handler_unblock(global.display, this.blocked);
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
        this.zorin?.set_boolean('super-hotkey', true);
    }
}
