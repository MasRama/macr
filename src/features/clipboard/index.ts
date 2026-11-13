import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { setClipboardHistory } from '../../shared/clipboard-link.js';
import type { Module, ModuleContext } from '../../shared/module.js';
import { ClipboardHistory } from './history.js';
import { ClipboardPanel } from './panel.js';

const KEY = 'clipboard-history-enabled';
const SHORTCUT = 'clipboard-history-shortcut';

/** The clipboard history on its keyboard shortcut (Ctrl+Super+V). */
export class ClipboardModule implements Module {
    private history: ClipboardHistory | null = null;
    private panel: ClipboardPanel | null = null;

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const history = new ClipboardHistory();
        const panel = new ClipboardPanel(history);
        this.history = history;
        this.panel = panel;
        setClipboardHistory({ open: (query) => panel.open(query) });
        // POPUP too, so the shortcut also closes it.
        Main.wm.addKeybinding(SHORTCUT, this.context.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP, () => panel.toggle());
    }

    disable(): void {
        Main.wm.removeKeybinding(SHORTCUT);
        setClipboardHistory(null);
        this.panel?.destroy();
        this.panel = null;
        // Kept while only the lock screen turned the module off.
        this.history?.destroy(this.context.settings.get_boolean(KEY));
        this.history = null;
    }
}
