// @girs/gnome-shell 46.0.2 has no typings for ui/grabHelper.js. These cover
// the parts of GNOME Shell 46's GrabHelper that Macr uses.
declare module 'resource:///org/gnome/shell/ui/grabHelper.js' {
    import type Clutter from 'gi://Clutter';

    export interface GrabParams {
        actor: Clutter.Actor;
        focus?: Clutter.Actor | null;
        /** Called with true when Esc or a click outside ended the grab. */
        onUngrab?: ((isUser: boolean) => void) | null;
    }

    export class GrabHelper {
        constructor(owner: Clutter.Actor, params?: Record<string, unknown>);
        grab(params: GrabParams): boolean;
        ungrab(params?: { actor?: Clutter.Actor; isUser?: boolean }): void;
        readonly grabbed: boolean;
    }
}
