import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import type { Module } from '../../shared/module.js';
import { GradeEffect } from './grade-effect.js';
import { type Grade, gradeAt, sunTimes } from './logic/grade.js';

const EFFECT = 'macr-dynamic-desktop';
/** The grade moves slowly: once a minute is smooth. */
const TICK_SECONDS = 60;

type CreateActor = (this: unknown) => Meta.BackgroundActor;
type ManagerProto = { _createBackgroundActor: CreateActor };

/**
 * Dynamic desktop: the user's own wallpaper follows the time of day, as
 * macOS's dynamic desktop pictures do: cool and dim at night, warm at
 * sunrise and golden hour, as it is by day. Every desktop picture (desktop,
 * overview, Mission Control) gets a grading effect; GNOME's background
 * manager is wrapped so pictures made later get it too.
 */
export class DynamicDesktopModule implements Module {
    private readonly actors = new Map<Meta.BackgroundActor, number>();
    private original: CreateActor | null = null;
    private timerId = 0;
    private sun: Gio.DBusProxy | null = null;
    private sunId = 0;
    private cancellable: Gio.Cancellable | null = null;
    private grade: Grade | null = null;
    /** For trying it out (devshell): the hour to show instead of the clock. */
    hourOverride: number | null = null;

    enable(): void {
        const proto = Background.BackgroundManager.prototype as unknown as ManagerProto;
        const original = proto._createBackgroundActor;
        this.original = original;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const module = this;
        proto._createBackgroundActor = function (this: unknown) {
            const actor = original.call(this);
            module.attach(actor);
            return actor;
        };
        this.walk(global.stage as Clutter.Actor);
        this.update();
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, TICK_SECONDS, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });
        this.watchSun();
    }

    disable(): void {
        if (this.original) (Background.BackgroundManager.prototype as unknown as ManagerProto)._createBackgroundActor = this.original;
        this.original = null;
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        this.cancellable?.cancel();
        this.cancellable = null;
        if (this.sun && this.sunId) this.sun.disconnect(this.sunId);
        this.sun = null;
        this.sunId = 0;
        for (const [actor, id] of this.actors) {
            actor.disconnect(id);
            actor.remove_effect_by_name(EFFECT);
        }
        this.actors.clear();
        this.grade = null;
    }

    /** Shows the grade for the time now (or `hourOverride`). */
    update(): void {
        const now = GLib.DateTime.new_now_local();
        const hour = this.hourOverride ?? now.get_hour() + now.get_minute() / 60 + now.get_second() / 3600;
        const { sunrise, sunset } = sunTimes(this.sunValue('Sunrise'), this.sunValue('Sunset'));
        this.grade = gradeAt(hour, sunrise, sunset);
        for (const actor of this.actors.keys()) (actor.get_effect(EFFECT) as GradeEffect | null)?.setGrade(this.grade);
    }

    private attach(actor: Meta.BackgroundActor): void {
        if (this.actors.has(actor)) return;
        const effect = new GradeEffect();
        actor.add_effect_with_name(EFFECT, effect);
        if (this.grade) effect.setGrade(this.grade);
        this.actors.set(
            actor,
            actor.connect('destroy', () => this.actors.delete(actor)),
        );
    }

    /** Desktop pictures already on the stage. */
    private walk(actor: Clutter.Actor): void {
        if (actor instanceof Meta.BackgroundActor) {
            this.attach(actor);
            return;
        }
        for (const child of actor.get_children()) this.walk(child);
    }

    /** gsd's Night Light knows sunrise and sunset when location is on; -1 otherwise. */
    private sunValue(name: string): number {
        const value = this.sun?.get_cached_property(name)?.deepUnpack();
        return typeof value === 'number' ? value : -1;
    }

    private watchSun(): void {
        const cancellable = new Gio.Cancellable();
        this.cancellable = cancellable;
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null,
            'org.gnome.SettingsDaemon.Color',
            '/org/gnome/SettingsDaemon/Color',
            'org.gnome.SettingsDaemon.Color',
            cancellable,
            (_source, result) => {
                let proxy: Gio.DBusProxy;
                try {
                    proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch {
                    // Cancelled, or no settings daemon (the devshell): 6:00 to 18:00.
                    return;
                }
                if (this.cancellable !== cancellable) return;
                this.cancellable = null;
                this.sun = proxy;
                this.sunId = proxy.connect('g-properties-changed', () => this.update());
                this.update();
            },
        );
    }
}
