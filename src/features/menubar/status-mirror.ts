import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { BorrowedMenu } from './borrowed-menu.js';

type Disconnectable = { disconnect(id: number): void };
type Boxes = { _rightBox: St.BoxLayout };

/** One main-bar button shown on another bar. */
class MirroredButton {
    readonly button = new PanelMenu.Button(0.0, 'Macr Mirror', true);
    private readonly borrowed: BorrowedMenu;
    private readonly ids: [Disconnectable, number][] = [];

    constructor(readonly owner: PanelMenu.Button) {
        const source = owner.get_first_child();
        if (source) {
            const clone = new Clutter.Clone({ source });
            this.button.add_child(clone);
            // A clone scales the source to its own size, measured when it is
            // laid out: lay it out again when the source's size changes.
            this.ids.push([source, source.connect('notify::allocation', () => clone.queue_relayout())]);
            // Gone with its owner, and its handlers with it.
            this.ids.push([source, source.connect('destroy', () => (this.ids.length = 0))]);
        }
        this.borrowed = new BorrowedMenu(this.button, owner);
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        this.borrowed.destroy();
        this.button.destroy();
    }
}

/**
 * Live copies of the main bar's right-side buttons (status icons, app tray
 * icons, quick settings), in the same order, for another monitor's bar. They
 * follow buttons that come, go, show or hide; clicking one acts on the real
 * button. Macr's own items and the hidden dateMenu are left out.
 */
export class StatusMirror {
    readonly actor = new St.BoxLayout();
    private readonly items = new Map<PanelMenu.Button, MirroredButton>();
    private readonly ids: [Disconnectable, number][] = [];
    /** Visibility and destroy handlers on the main bar's buttons. */
    private watched: [Disconnectable, number, number][] = [];
    private syncId = 0;

    constructor() {
        const right = (Main.panel as unknown as Boxes)._rightBox;
        this.ids.push([right, right.connect('child-added', () => this.queueSync())]);
        this.ids.push([right, right.connect('child-removed', () => this.queueSync())]);
        this.sync();
    }

    destroy(): void {
        if (this.syncId) GLib.source_remove(this.syncId);
        this.syncId = 0;
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        this.unwatch();
        for (const item of this.items.values()) item.destroy();
        this.items.clear();
        this.actor.destroy();
    }

    private queueSync(): void {
        if (this.syncId) return;
        this.syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.syncId = 0;
            this.sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** The buttons to copy, in bar order. */
    private owners(): PanelMenu.Button[] {
        const skipped = new Set<unknown>();
        for (const [role, button] of Object.entries(Main.panel.statusArea as Record<string, unknown>)) {
            if (role.startsWith('macr-') || role === 'dateMenu') skipped.add(button);
        }
        const owners: PanelMenu.Button[] = [];
        for (const container of (Main.panel as unknown as Boxes)._rightBox.get_children()) {
            const button = (container as St.Bin).child;
            if (!(button instanceof PanelMenu.Button) || skipped.has(button)) continue;
            if (container.visible && button.visible) owners.push(button);
        }
        return owners;
    }

    private unwatch(): void {
        for (const [target, visible, destroy] of this.watched) {
            target.disconnect(visible);
            target.disconnect(destroy);
        }
        this.watched = [];
    }

    private sync(): void {
        this.unwatch();
        // Shown or hidden later (a tray icon, the keyboard layout): sync again.
        for (const container of (Main.panel as unknown as Boxes)._rightBox.get_children()) {
            const button = (container as St.Bin).child;
            for (const actor of button ? [container, button] : [container]) {
                const visible = actor.connect('notify::visible', () => this.queueSync());
                const destroy = actor.connect('destroy', () => {
                    this.watched = this.watched.filter(([target]) => target !== actor);
                });
                this.watched.push([actor, visible, destroy]);
            }
        }

        const owners = this.owners();
        for (const [owner, item] of this.items) {
            if (owners.includes(owner)) continue;
            item.destroy();
            this.items.delete(owner);
        }
        owners.forEach((owner, index) => {
            let item = this.items.get(owner);
            if (!item) {
                item = new MirroredButton(owner);
                this.items.set(owner, item);
                this.actor.add_child(item.button.container);
            }
            this.actor.set_child_at_index(item.button.container, index);
        });
    }
}
