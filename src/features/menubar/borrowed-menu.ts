import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

type Disconnectable = { disconnect(id: number): void };
type SharedMenu = Disconnectable & {
    sourceActor: St.Widget;
    isOpen: boolean;
    close(animate?: boolean): void;
    connect(signal: string, callback: (menu: unknown, open: boolean) => void): number;
};
type Emitter = { emit(signal: string, ...args: unknown[]): unknown };

const FORWARDED = new Set([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE, Clutter.EventType.TOUCH_BEGIN, Clutter.EventType.SCROLL]);

/** The class handler of each forwarded event's own signal, after `event`. */
const SIGNAL_OF = new Map<Clutter.EventType, string>([
    [Clutter.EventType.BUTTON_PRESS, 'button-press-event'],
    [Clutter.EventType.BUTTON_RELEASE, 'button-release-event'],
    [Clutter.EventType.TOUCH_BEGIN, 'touch-event'],
    [Clutter.EventType.SCROLL, 'scroll-event'],
]);

/**
 * Makes `button` act as another panel button (`owner`): clicks, touches and
 * scrolls go to the owner, as if it was clicked, so it keeps its own
 * behaviour (AppIndicator double-click and middle-click, quick settings,
 * the hidden dateMenu's calendar). Its menu opens anchored on `button` and
 * goes back to the owner when it closes, so several bars can share it.
 */
export class BorrowedMenu {
    private readonly menu: SharedMenu | null;
    private readonly ids: [Disconnectable, number][] = [];
    /** Handlers on the owner and its menu, which go when the owner is destroyed. */
    private readonly ownerIds: [Disconnectable, number][] = [];
    private gone = false;

    constructor(
        private readonly button: PanelMenu.Button,
        private readonly owner: PanelMenu.Button,
    ) {
        const menu = owner.menu as unknown as Partial<SharedMenu> | null;
        // A button made without a menu has a dummy one: nothing to anchor.
        this.menu = menu && 'sourceActor' in menu && typeof menu.connect === 'function' ? (menu as SharedMenu) : null;
        if (this.menu) this.ownerIds.push([this.menu, this.menu.connect('open-state-changed', (_menu, open) => this.onOpenState(open))]);
        this.ownerIds.push([owner, owner.connect('destroy', () => this.ownerGone())]);
        this.ids.push([button, button.connect('event', (_actor, event: Clutter.Event) => this.forward(event))]);
    }

    destroy(): void {
        for (const [target, id] of [...this.ids, ...this.ownerIds]) target.disconnect(id);
        this.ids.length = 0;
        this.ownerIds.length = 0;
        if (this.gone || this.menu?.sourceActor !== this.button) return;
        if (this.menu.isOpen) this.menu.close(false);
        this.menu.sourceActor = this.owner;
        this.button.remove_style_pseudo_class('active');
    }

    private ownerGone(): void {
        this.gone = true;
        this.ownerIds.length = 0;
    }

    private forward(event: Clutter.Event): boolean {
        const type = event.type();
        if (this.gone || !FORWARDED.has(type)) return Clutter.EVENT_PROPAGATE;
        const menu = this.menu;
        if (menu && type !== Clutter.EventType.SCROLL) {
            // Open from another bar: close it there; this click opens it here.
            if (menu.isOpen && menu.sourceActor !== this.button) menu.close(false);
            menu.sourceActor = this.button;
        }
        const owner = this.owner as unknown as Emitter;
        if (owner.emit('event', event) === Clutter.EVENT_STOP) return Clutter.EVENT_STOP;
        owner.emit(SIGNAL_OF.get(type) as string, event);
        return Clutter.EVENT_STOP;
    }

    private onOpenState(open: boolean): void {
        const menu = this.menu as SharedMenu;
        if (open && menu.sourceActor === this.button) {
            this.button.add_style_pseudo_class('active');
            return;
        }
        this.button.remove_style_pseudo_class('active');
        // Closed: the owner's own bar opens it where it belongs again.
        if (!open && menu.sourceActor === this.button) menu.sourceActor = this.owner;
    }
}
