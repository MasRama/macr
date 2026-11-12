import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { Spotlight } from './spotlight.js';

const SHORTCUT = 'spotlight-shortcut';

/** Spotlight on its keyboard shortcut (Ctrl+Space by default). */
export class SpotlightModule implements Module {
    private spotlight: Spotlight | null = null;

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const spotlight = new Spotlight();
        this.spotlight = spotlight;
        // POPUP too, so the shortcut also closes it.
        Main.wm.addKeybinding(SHORTCUT, this.context.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP, () => spotlight.toggle());
    }

    disable(): void {
        Main.wm.removeKeybinding(SHORTCUT);
        this.spotlight?.destroy();
        this.spotlight = null;
    }
}
