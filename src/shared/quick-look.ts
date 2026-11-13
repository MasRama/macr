import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { selectionStep, stepIndex } from './logic/quick-look.js';

/** GNOME's file previewer (Sushi), the one Files opens with Space. */
const NAME = 'org.gnome.NautilusPreviewer';
const PATH = '/org/gnome/NautilusPreviewer';
const IFACE = 'org.gnome.NautilusPreviewer2';

let proxy: Gio.DBusProxy | null = null;
let signalId = 0;
let propertiesId = 0;
let windowId = 0;
/** What is being looked at: arrow keys in the previewer step through it. */
let list: string[] = [];
let index = -1;
/** Bumped by a reset, so a proxy that arrives after one is dropped. */
let generation = 0;

function show(uri: string): void {
    proxy?.call(IFACE + '.ShowFile', new GLib.Variant('(ssb)', [uri, '', false]), Gio.DBusCallFlags.NONE, -1, null, (_proxy, result) => {
        try {
            proxy?.call_finish(result);
        } catch (error) {
            console.warn(`Macr: Quick Look could not show ${uri}: ${error}`);
        }
    });
}

/** The previewer opened from the shell has no parent window to inherit focus from: give it focus. */
function focusPreviewer(): void {
    const open = global.get_window_actors().map((actor) => actor.meta_window).find((window) => window.get_gtk_application_id() === NAME);
    if (open) {
        Main.activateWindow(open);
        return;
    }
    if (windowId) return;
    windowId = global.display.connect('window-created', (_display: Meta.Display, window: Meta.Window) => {
        if (window.get_gtk_application_id() !== NAME) return;
        global.display.disconnect(windowId);
        windowId = 0;
        const actor = window.get_compositor_private() as Meta.WindowActor | null;
        const activate = () => Main.activateWindow(window);
        if (actor) {
            const id = actor.connect('first-frame', () => {
                actor.disconnect(id);
                activate();
            });
        } else activate();
    });
}

function onSignal(_proxy: Gio.DBusProxy, _sender: string | null, name: string, parameters: GLib.Variant): void {
    if (name !== 'SelectionEvent' || index < 0) return;
    const [direction] = parameters.deepUnpack() as [number];
    const next = stepIndex(index, selectionStep(direction), list.length);
    if (next === index || next < 0) return;
    index = next;
    show(list[index]);
}

/**
 * Quick Look: `uris[at]` in GNOME's previewer, as Space does in Files. The
 * previewer's arrow keys step through `uris`; Space or Escape closes it.
 * Does nothing (but log) when no previewer is installed.
 */
export function quickLook(uris: string[], at: number): void {
    if (at < 0 || at >= uris.length) return;
    list = [...uris];
    index = at;
    const uri = list[index];
    if (proxy) {
        focusPreviewer();
        show(uri);
        return;
    }
    const asked = generation;
    Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES, null, NAME, PATH, IFACE, null, (_source, result) => {
        let made: Gio.DBusProxy;
        try {
            made = Gio.DBusProxy.new_for_bus_finish(result);
        } catch (error) {
            console.warn(`Macr: no Quick Look previewer: ${error}`);
            return;
        }
        if (asked !== generation || proxy) return;
        proxy = made;
        signalId = proxy.connect('g-signal', onSignal);
        // Closed (Space, Escape): the arrow keys no longer belong to our list.
        propertiesId = proxy.connect('g-properties-changed', (_proxy: Gio.DBusProxy, changed: GLib.Variant) => {
            const visible = (changed.deepUnpack() as Record<string, GLib.Variant>).Visible;
            if (visible && !visible.deepUnpack()) index = -1;
        });
        focusPreviewer();
        show(list[index] ?? uri);
    });
}

/** Closes a preview Macr opened and lets go of the previewer. */
export function resetQuickLook(): void {
    generation++;
    if (proxy && index >= 0) proxy.call(IFACE + '.Close', null, Gio.DBusCallFlags.NONE, -1, null, null);
    if (proxy && signalId) proxy.disconnect(signalId);
    if (proxy && propertiesId) proxy.disconnect(propertiesId);
    if (windowId) global.display.disconnect(windowId);
    proxy = null;
    signalId = 0;
    propertiesId = 0;
    windowId = 0;
    list = [];
    index = -1;
}
