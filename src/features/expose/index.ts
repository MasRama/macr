import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { BorrowedKeys } from '../../shared/borrowed-keys.js';
import { setExpose } from '../../shared/expose-link.js';
import type { Module } from '../../shared/module.js';
import { ExposeOverlay } from './overlay.js';

const SHORTCUT = 'app-expose-shortcut';

type Disconnectable = { disconnect(id: number): void };
type Connectable = Disconnectable & { connect(signal: string, callback: () => void): number };

/**
 * App Exposé: all of one app's windows at a glance, from the dock icon's
 * menu or Super+Down for the focused app. Stock GNOME's Super+Down
 * (unmaximize) gives way while it runs.
 */
export class AppExposeModule implements Module {
    private overlay: ExposeOverlay | null = null;
    private readonly unmaximize: BorrowedKeys;
    private ids: [Disconnectable, number][] = [];

    constructor(private readonly settings: Gio.Settings) {
        this.unmaximize = new BorrowedKeys(settings, 'app-expose-saved-wm', 'org.gnome.desktop.wm.keybindings', ['unmaximize']);
    }

    enable(): void {
        const overlay = new ExposeOverlay();
        this.overlay = overlay;
        setExpose({ show: (app) => overlay.open(app) });
        this.unmaximize.take(this.settings.get_strv(SHORTCUT));
        Main.wm.addKeybinding(SHORTCUT, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP, () => {
            if (overlay.isOpen) {
                overlay.close(null);
                return;
            }
            const app = Shell.WindowTracker.get_default().focus_app;
            if (app && !Main.modalCount) overlay.open(app);
        });
        const overview = Main.overview as unknown as Connectable;
        this.ids.push([overview, overview.connect('showing', () => overlay.close(null))]);
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        Main.wm.removeKeybinding(SHORTCUT);
        this.unmaximize.giveBack();
        setExpose(null);
        this.overlay?.destroy();
        this.overlay = null;
    }
}
