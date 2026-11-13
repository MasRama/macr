import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { DesktopReveal } from '../../shared/desktop-reveal.js';
import { expose } from '../../shared/expose-link.js';
import { launchpad } from '../../shared/launchpad-link.js';
import {
    type Action,
    endsOpen,
    FINGERS,
    openness,
    type Pinch,
    pinchAction,
    pinchDirection,
    pinchProgress,
    type Shown,
    type Swipe,
    swipeAction,
    swipeDirection,
    swipeProgress,
} from './logic/gestures.js';

/** What a gesture moves: the target's track() and settle(), bound. */
interface Driven {
    track(openness: number): void;
    settle(open: boolean): void;
}

type State =
    | { kind: 'idle' }
    /** Fingers down, direction not known yet. */
    | { kind: 'pending'; gesture: 'pinch' | 'swipe'; dx: number; dy: number }
    | { kind: 'ignored' }
    | { kind: 'pinch'; direction: Pinch; action: Action; driven: Driven; progress: number }
    | { kind: 'swipe'; direction: Swipe; action: Action; driven: Driven; progress: number; dy: number };

/**
 * Four-finger touchpad gestures, as on macOS: pinch for Launchpad, spread
 * to show the desktop, swipe down for App Exposé of the focused app. What
 * they open follows the fingers, and the opposite gesture closes it.
 * An event filter sees the gestures even while Launchpad or App Exposé
 * hold the input; three-finger gestures are left to GNOME.
 */
export class TouchpadGestures {
    private readonly filterId: number;
    private state: State = { kind: 'idle' };

    constructor(private readonly reveal: DesktopReveal) {
        this.filterId = Clutter.Event.add_filter(global.stage as Clutter.Stage, (event: Clutter.Event) => this.handle(event));
    }

    destroy(): void {
        Clutter.Event.remove_filter(this.filterId);
        this.end(true);
    }

    /** Exposed for the devshell, which has no touchpad. */
    handle(event: Clutter.Event): boolean {
        const type = event.type();
        if (type !== Clutter.EventType.TOUCHPAD_PINCH && type !== Clutter.EventType.TOUCHPAD_SWIPE) return Clutter.EVENT_PROPAGATE;
        const phase = event.get_gesture_phase();
        if (phase === Clutter.TouchpadGesturePhase.BEGIN) {
            this.end(true);
            const allowed = event.get_touchpad_gesture_finger_count() === FINGERS && this.allowed();
            this.state = allowed ? { kind: 'pending', gesture: type === Clutter.EventType.TOUCHPAD_PINCH ? 'pinch' : 'swipe', dx: 0, dy: 0 } : { kind: 'ignored' };
            return allowed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        }
        if (this.state.kind === 'idle' || this.state.kind === 'ignored') {
            if (phase === Clutter.TouchpadGesturePhase.END || phase === Clutter.TouchpadGesturePhase.CANCEL) this.state = { kind: 'idle' };
            return Clutter.EVENT_PROPAGATE;
        }
        if (phase === Clutter.TouchpadGesturePhase.END || phase === Clutter.TouchpadGesturePhase.CANCEL) {
            this.end(phase === Clutter.TouchpadGesturePhase.CANCEL);
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCHPAD_PINCH) this.pinch(event.get_gesture_pinch_scale());
        else {
            const [dx, dy] = event.get_gesture_motion_delta_unaccelerated();
            this.swipe(dx, dy);
        }
        return Clutter.EVENT_STOP;
    }

    private pinch(scale: number): void {
        if (this.state.kind === 'pending') {
            if (this.state.gesture !== 'pinch') return;
            const direction = pinchDirection(scale);
            if (!direction) return;
            this.start('pinch', direction, pinchAction(direction, this.shown()));
        }
        const state = this.state;
        if (state.kind !== 'pinch') return;
        state.progress = pinchProgress(state.direction, scale);
        state.driven.track(openness(state.action, state.progress));
    }

    private swipe(dx: number, dy: number): void {
        if (this.state.kind === 'pending') {
            if (this.state.gesture !== 'swipe') return;
            this.state.dx += dx;
            this.state.dy += dy;
            const direction = swipeDirection(this.state.dx, this.state.dy);
            if (!direction) return;
            if (direction === 'sideways') {
                this.state = { kind: 'ignored' };
                return;
            }
            this.start('swipe', direction, swipeAction(direction, this.shown()));
        } else if (this.state.kind === 'swipe') {
            this.state.dy += dy;
        }
        const state = this.state;
        if (state.kind !== 'swipe') return;
        state.progress = swipeProgress(state.direction, state.dy);
        state.driven.track(openness(state.action, state.progress));
    }

    private start(gesture: 'pinch' | 'swipe', direction: Pinch | Swipe, action: Action | null): void {
        const driven = action && this.driven(action);
        if (!action || !driven) {
            this.state = { kind: 'ignored' };
            return;
        }
        // The swipe so far counts towards it.
        const dy = this.state.kind === 'pending' ? this.state.dy : 0;
        this.state = gesture === 'pinch'
            ? { kind: 'pinch', direction: direction as Pinch, action, driven, progress: 0 }
            : { kind: 'swipe', direction: direction as Swipe, action, driven, progress: 0, dy };
    }

    /** Lifts the fingers: what the gesture drives finishes, or springs back. */
    private end(cancelled: boolean): void {
        const state = this.state;
        this.state = { kind: 'idle' };
        if (state.kind === 'pinch' || state.kind === 'swipe') state.driven.settle(endsOpen(state.action, state.progress, cancelled));
    }

    private shown(): Shown {
        return { launchpad: launchpad()?.isOpen ?? false, desktop: this.reveal.isRevealed, expose: expose()?.isOpen ?? false };
    }

    /** Gestures work on the desktop and in the overview, and over what they opened. */
    private allowed(): boolean {
        const shown = this.shown();
        if (shown.launchpad || shown.expose) return true;
        return (Main.actionMode & (Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW)) !== 0;
    }

    private driven(action: Action): Driven | null {
        switch (action.target) {
            case 'launchpad': {
                const link = launchpad();
                return link && { track: (open) => link.track(open), settle: (open) => link.settle(open) };
            }
            case 'desktop':
                if (Main.overview.visible) Main.overview.hide();
                return { track: (open) => this.reveal.track(open), settle: (open) => this.reveal.settle(open) };
            case 'expose': {
                const link = expose();
                const app = Shell.WindowTracker.get_default().focus_app;
                if (!link || !(app || link.isOpen)) return null;
                return { track: (open) => link.track(app, open), settle: (open) => link.settle(open) };
            }
        }
    }
}
