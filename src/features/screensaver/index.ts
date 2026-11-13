import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module } from '../../shared/module.js';
import { LOCK_DATE_FORMAT, lockTimeFormat } from '../lockscreen/logic/clock.js';
import { driftAt, saverDelay } from './logic/screensaver.js';

type Easeable = { ease(params: object): void };

/** Fade in and out, in milliseconds. */
const FADE_MS = 1200;
/** One slow move of the drift, in milliseconds. */
const DRIFT_MS = 24000;
/** org.gnome.SessionManager's inhibit flag for "the session is busy, do not go idle". */
const INHIBIT_IDLE = 8;

/**
 * The macOS screen saver: after the chosen minutes without input, the
 * wallpaper drifts slowly across every screen under a big clock. Any key,
 * click or pointer move ends it; that input goes no further. It does not
 * start while an app inhibits idleness (a playing video), and GNOME's own
 * blank and lock come after it as before.
 */
export class ScreenSaverModule implements Module {
    private readonly idle = global.backend.get_core_idle_monitor();
    private readonly session = new Gio.Settings({ schema_id: 'org.gnome.desktop.session' });
    private readonly ids: [{ disconnect(id: number): void }, number][] = [];
    private idleId = 0;
    private saver: Saver | null = null;
    private cancel: Gio.Cancellable | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        this.ids.push([this.settings, this.settings.connect('changed::screensaver-delay', () => this.watch())]);
        this.ids.push([this.session, this.session.connect('changed::idle-delay', () => this.watch())]);
        this.ids.push([Main.sessionMode, Main.sessionMode.connect('updated', () => Main.sessionMode.isLocked && this.stop())]);
        this.ids.push([Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this.stop())]);
        this.watch();
    }

    disable(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        if (this.idleId) this.idle.remove_watch(this.idleId);
        this.idleId = 0;
        this.cancel?.cancel();
        this.cancel = null;
        this.saver?.destroy();
        this.saver = null;
    }

    private watch(): void {
        if (this.idleId) this.idle.remove_watch(this.idleId);
        const seconds = saverDelay(this.settings.get_uint('screensaver-delay'), this.session.get_uint('idle-delay'));
        this.idleId = this.idle.add_idle_watch(Math.max(1, seconds) * 1000, () => this.idled());
    }

    /** Asks the session manager first: a video or a call keeps the screen as it is. */
    private idled(): void {
        if (this.saver || Main.sessionMode.isLocked) return;
        this.cancel?.cancel();
        const cancel = new Gio.Cancellable();
        this.cancel = cancel;
        Gio.DBus.session.call(
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager',
            'org.gnome.SessionManager',
            'IsInhibited',
            new GLib.Variant('(u)', [INHIBIT_IDLE]),
            new GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE,
            -1,
            cancel,
            (bus, result) => {
                let inhibited = false;
                try {
                    [inhibited] = bus!.call_finish(result).deepUnpack() as [boolean];
                } catch {
                    if (cancel.is_cancelled()) return;
                    // No session manager (a bare shell): nothing inhibits.
                }
                if (this.cancel !== cancel) return;
                this.cancel = null;
                // Input came while asking: the user is back.
                if (inhibited || this.idle.get_idletime() < 1000 || Main.sessionMode.isLocked) return;
                this.start();
            },
        );
    }

    private start(): void {
        this.saver = new Saver(() => (this.saver = null));
    }

    private stop(): void {
        this.cancel?.cancel();
        this.cancel = null;
        this.saver?.destroy();
        this.saver = null;
    }
}

/** The screen saver on every monitor, from fade-in until the first input. */
class Saver {
    private readonly root = new St.Widget({ name: 'macr-screensaver', reactive: true, opacity: 0 });
    private readonly backgrounds: Background.BackgroundManager[] = [];
    private readonly drifts: Clutter.Actor[] = [];
    private readonly clocks: [St.Label, St.Label][] = [];
    private readonly idle = global.backend.get_core_idle_monitor();
    private readonly use24h = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).get_string('clock-format') === '24h';
    private grab: Clutter.Grab | null = null;
    private activeId = 0;
    private clockId = 0;
    private driftId = 0;
    private step = 0;
    private ending = false;
    private destroyed = false;

    constructor(private readonly onGone: () => void) {
        Main.uiGroup.add_child(this.root);
        this.root.set_size(global.stage.width, global.stage.height);
        for (const [index, monitor] of Main.layoutManager.monitors.entries()) {
            const screen = new St.Widget({ x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height, clip_to_allocation: true });
            const drift = new Clutter.Actor({ width: monitor.width, height: monitor.height, pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }) });
            screen.add_child(drift);
            this.backgrounds.push(new Background.BackgroundManager({ container: drift, monitorIndex: index, controlPosition: false }));
            this.drifts.push(drift);

            const clock = new St.BoxLayout({ vertical: true, style_class: 'macr-screensaver-clock', x_expand: true });
            const date = new St.Label({ style_class: 'macr-screensaver-date', x_align: Clutter.ActorAlign.CENTER });
            const time = new St.Label({ style_class: 'macr-screensaver-time', x_align: Clutter.ActorAlign.CENTER });
            clock.add_child(date);
            clock.add_child(time);
            clock.set_width(monitor.width);
            clock.set_position(0, Math.round(monitor.height * 0.09));
            screen.add_child(clock);
            this.clocks.push([date, time]);
            this.root.add_child(screen);
        }
        this.tick();
        this.drift(true);

        // Input ends it and goes no further, as on macOS.
        this.grab = Main.pushModal(this.root) as Clutter.Grab;
        this.activeId = this.idle.add_user_active_watch(() => {
            this.activeId = 0;
            this.end();
        });
        (this.root as unknown as Easeable).ease({ opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD });
    }

    /** Fades out, then goes; the modal goes at once so input works again. */
    end(): void {
        if (this.ending) return;
        this.ending = true;
        this.release();
        (this.root as unknown as Easeable).ease({
            opacity: 0,
            duration: FADE_MS / 3,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.destroy(),
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.ending = true;
        this.release();
        for (const drift of this.drifts) drift.remove_all_transitions();
        for (const background of this.backgrounds) background.destroy();
        this.backgrounds.length = 0;
        this.root.destroy();
        this.onGone();
    }

    private release(): void {
        if (this.activeId) this.idle.remove_watch(this.activeId);
        this.activeId = 0;
        for (const id of [this.clockId, this.driftId]) if (id) GLib.source_remove(id);
        this.clockId = 0;
        this.driftId = 0;
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
    }

    /** Shows the time, then waits for the next minute. */
    private tick(): void {
        const now = GLib.DateTime.new_now_local();
        for (const [date, time] of this.clocks) {
            date.text = now.format(LOCK_DATE_FORMAT) ?? '';
            time.text = now.format(lockTimeFormat(this.use24h)) ?? '';
        }
        this.clockId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, (60 - now.get_second()) * 1000, () => {
            this.clockId = 0;
            this.tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Eases every wallpaper to the next resting point, and moves on from a
     * timer: with animations off an ease ends at once, so chaining on its
     * end would never stop.
     */
    private drift(first = false): void {
        if (this.ending) return;
        const { scale, x, y } = driftAt(this.step++);
        for (const [index, actor] of this.drifts.entries()) {
            const monitor = Main.layoutManager.monitors[index]!;
            const target = { scale_x: scale, scale_y: scale, translation_x: x * monitor.width, translation_y: y * monitor.height };
            if (first) actor.set(target);
            else (actor as unknown as Easeable).ease({ ...target, duration: DRIFT_MS, mode: Clutter.AnimationMode.EASE_IN_OUT_SINE });
        }
        if (first) {
            this.drift();
            return;
        }
        this.driftId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DRIFT_MS, () => {
            this.driftId = 0;
            this.drift();
            return GLib.SOURCE_REMOVE;
        });
    }
}
