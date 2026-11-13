import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { EmojiPicker } from './picker.js';

const SHORTCUT = 'emoji-picker-shortcut';

/** The emoji picker on its keyboard shortcut (Ctrl+Super+Space, as Ctrl+Cmd+Space on a Mac). */
export class EmojiModule implements Module {
    private picker: EmojiPicker | null = null;

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const picker = new EmojiPicker(this.context.settings);
        this.picker = picker;
        // POPUP too, so the shortcut also closes it.
        Main.wm.addKeybinding(SHORTCUT, this.context.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP, () => picker.toggle());
    }

    disable(): void {
        Main.wm.removeKeybinding(SHORTCUT);
        this.picker?.destroy();
        this.picker = null;
    }
}
