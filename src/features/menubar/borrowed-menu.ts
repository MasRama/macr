import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

type Disconnectable = { disconnect(id: number): void };
type SharedMenu = Disconnectable & {
    sourceActor: St.Widget;
    isOpen: boolean;
    toggle(): void;
    close(animate?: boolean): void;
    connect(signal: string, callback: (menu: unknown, open: boolean) => void): number;
};

/**
 * Opens another indicator's menu (the hidden dateMenu, or the quick settings
 * of the main bar) from `button`, anchored on it. The menu is pointed at the
 * button just before it opens, so several bars can share one menu.
 */
export class BorrowedMenu {
    private readonly menu: SharedMenu;
    private readonly ids: [Disconnectable, number][] = [];

    constructor(
        private readonly button: PanelMenu.Button,
        private readonly owner: PanelMenu.Button,
    ) {
        this.menu = owner.menu as unknown as SharedMenu;
        this.ids.push([this.menu, this.menu.connect('open-state-changed', (_menu, open) => this.syncActive(open))]);
        this.ids.push([button, button.connect('button-press-event', () => this.toggle())]);
        this.ids.push([
            button,
            button.connect('touch-event', (_actor, event: Clutter.Event) => {
                if (event.type() === Clutter.EventType.TOUCH_BEGIN) return this.toggle();
                return Clutter.EVENT_PROPAGATE;
            }),
        ]);
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        if (this.menu.sourceActor !== this.button) return;
        if (this.menu.isOpen) this.menu.close(false);
        this.menu.sourceActor = this.owner;
    }

    private toggle(): boolean {
        // Open elsewhere: close it there, then open it here.
        if (this.menu.isOpen && this.menu.sourceActor !== this.button) this.menu.close(false);
        this.menu.sourceActor = this.button;
        this.menu.toggle();
        return Clutter.EVENT_STOP;
    }

    private syncActive(open: boolean): void {
        if (open && this.menu.sourceActor === this.button) this.button.add_style_pseudo_class('active');
        else this.button.remove_style_pseudo_class('active');
    }
}
