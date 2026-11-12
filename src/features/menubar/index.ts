import type St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import type { Module, ModuleContext } from '../../shared/module.js';
import { AppMenu } from './app-menu.js';
import { AppMenus } from './app-menus.js';
import { Clock } from './clock.js';
import { FocusTracker } from './focus.js';
import { logoMenu } from './logo-menu.js';
import { PanelTweaks } from './panel-tweaks.js';
import { SecondaryBar } from './secondary-bar.js';
import { windowMenu } from './window-menu.js';

type Boxes = { _leftBox: St.BoxLayout; _rightBox: St.BoxLayout };
type Disconnectable = { disconnect(id: number): void };

/**
 * Turns GNOME's top bar into a macOS menu bar: logo, app and Window menus on
 * the left, Macr's clock at the right end. The centre stays free (Nokta).
 * Other monitors get a menu bar of their own.
 */
export class MenuBar implements Module {
    private tweaks: PanelTweaks | null = null;
    private focus: FocusTracker | null = null;
    private clock: Clock | null = null;
    private buttons: PanelMenu.Button[] = [];
    private rightAddedId = 0;
    private appMenu: AppMenu | null = null;
    private appMenus: AppMenus | null = null;
    private appMenuCount = 0;
    private bars: SecondaryBar[] = [];
    private ids: [Disconnectable, number][] = [];

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        this.tweaks = new PanelTweaks(this.context.settings);
        this.focus = new FocusTracker(() => this.syncAppMenus());
        const appMenu = new AppMenu(this.focus);
        this.appMenu = appMenu;

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

        const settings = this.context.settings;
        this.ids.push([settings, settings.connect('changed::menubar-all-monitors', () => this.buildBars())]);
        this.ids.push([settings, settings.connect('changed::menubar-app-menus', () => {
            this.buildAppMenus();
            this.buildBars();
        })]);
        this.buildAppMenus();
        const layout = Main.layoutManager as unknown as { connect(signal: string, callback: () => void): number } & Disconnectable;
        this.ids.push([layout, layout.connect('monitors-changed', () => this.buildBars())]);
        this.buildBars();
    }

    disable(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids = [];
        this.destroyBars();
        this.appMenus?.destroy();
        this.appMenus = null;
        this.appMenu = null;
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

    /** A menu bar on every other monitor while the setting is on. */
    private buildBars(): void {
        this.destroyBars();
        const focus = this.focus;
        if (!focus || !this.context.settings.get_boolean('menubar-all-monitors')) return;
        const { monitors, primaryIndex } = Main.layoutManager;
        monitors.forEach((_monitor, index) => {
            if (index !== primaryIndex) this.bars.push(new SecondaryBar(index, focus, this.context.settings.get_boolean('menubar-app-menus')));
        });
    }

    private destroyBars(): void {
        for (const bar of this.bars) bar.destroy();
        this.bars = [];
    }

    private syncAppMenus(): void {
        this.appMenu?.sync();
        this.appMenus?.sync();
        for (const bar of this.bars) bar.sync();
    }

    /** The focused app's own menus, placed around the Window menu. */
    private buildAppMenus(): void {
        this.appMenus?.destroy();
        this.appMenus = null;
        const focus = this.focus;
        if (!focus || !this.context.settings.get_boolean('menubar-app-menus')) return;
        this.appMenus = new AppMenus(focus, (button, afterWindow) => {
            const left = (Main.panel as unknown as Boxes)._leftBox;
            const windowButton = (Main.panel.statusArea as Record<string, PanelMenu.Button | undefined>)['macr-window'];
            const at = windowButton ? left.get_children().indexOf(windowButton.container) : -1;
            const index = at < 0 ? left.get_n_children() : at + (afterWindow ? 1 : 0);
            Main.panel.addToStatusArea(`macr-app-menu-${this.appMenuCount++}`, button, index, 'left');
        });
    }

    private keepClockLast(): void {
        const container = (this.clock?.button as unknown as { container?: St.Widget } | undefined)?.container;
        const right = (Main.panel as unknown as Boxes)._rightBox;
        if (container && right.get_last_child() !== container) right.set_child_above_sibling(container, null);
    }
}
