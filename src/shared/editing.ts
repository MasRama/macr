import type Clutter from 'gi://Clutter';
import { GrabHelper } from 'resource:///org/gnome/shell/ui/grabHelper.js';

/**
 * Typing into an actor the shell draws (a sticky note, a reminder): takes
 * the keyboard while it lasts, so keys go to the shell and not to the
 * focused window. Esc or a click outside `owner` ends it.
 */
export class Editing {
    private helper: GrabHelper | null = null;
    private done: (() => void) | null = null;

    constructor(private readonly owner: Clutter.Actor) {}

    get active(): boolean {
        return this.helper !== null;
    }

    /** Puts the key focus on `focus`; `done` runs once when editing ends, however it ends. */
    start(focus: Clutter.Actor, done: () => void): void {
        if (this.helper) return;
        const helper = new GrabHelper(this.owner);
        this.helper = helper;
        this.done = done;
        if (!helper.grab({ actor: this.owner, focus, onUngrab: () => this.finish() })) this.finish();
    }

    stop(): void {
        this.helper?.ungrab({ actor: this.owner });
        this.finish();
    }

    private finish(): void {
        if (!this.helper) return;
        this.helper = null;
        const done = this.done;
        this.done = null;
        done?.();
    }
}
