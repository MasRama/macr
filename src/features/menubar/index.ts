import type St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { AppMenu } from './app-menu.js';
import { Clock } from './clock.js';
import { FocusTracker } from './focus.js';
import { logoMenu } from './logo-menu.js';
import { PanelTweaks } from './panel-tweaks.js';
import { windowMenu } from './window-menu.js';

type Boxes = { _rightBox: St.BoxLayout };

/**
 * Turns GNOME's top bar into a macOS menu bar: logo, app and Window menus on
 * the left, Macr's clock at the right end. The centre stays free (Nokta).
 */
export class MenuBar implements Module {
    private tweaks: PanelTweaks | null = null;
    private focus: FocusTracker | null = null;
    private clock: Clock | null = null;
    private buttons: PanelMenu.Button[] = [];
    private rightAddedId = 0;

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        this.tweaks = new PanelTweaks(this.context.settings);
        let appMenu: AppMenu | null = null;
        this.focus = new FocusTracker(() => appMenu?.sync());
        appMenu = new AppMenu(this.focus);

        const left: [string, PanelMenu.Button][] = [
            ['macr-logo', logoMenu()],
            ['macr-app', appMenu.button],
            ['macr-window', windowMenu(this.focus)],
        ];
        left.forEach(([role, button], index) => {
            Main.panel.addToStatusArea(role, button, index, 'left');
            this.buttons.push(button);
        });

        this.clock = new Clock();
        const right = (Main.panel as unknown as Boxes)._rightBox;
        Main.panel.addToStatusArea('macr-clock', this.clock.button, right.get_n_children(), 'right');
        // Indicators added later (AppIndicator icons) must not land after the clock.
        this.rightAddedId = right.connect('child-added', () => this.keepClockLast());
    }

    disable(): void {
        if (this.rightAddedId) (Main.panel as unknown as Boxes)._rightBox.disconnect(this.rightAddedId);
        this.rightAddedId = 0;
        this.clock?.destroy();
        this.clock = null;
        for (const button of this.buttons) button.destroy();
        this.buttons = [];
        this.focus?.destroy();
        this.focus = null;
        this.tweaks?.destroy();
        this.tweaks = null;
    }

    private keepClockLast(): void {
        const container = (this.clock?.button as unknown as { container?: St.Widget } | undefined)?.container;
        const right = (Main.panel as unknown as Boxes)._rightBox;
        if (container && right.get_last_child() !== container) right.set_child_above_sibling(container, null);
    }
}
