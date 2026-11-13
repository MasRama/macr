import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { Module } from '../../shared/module.js';
import { macLayout } from './logic/layout.js';
import { ZoomMenu } from './zoom-menu.js';
import { ASSETS, STYLESHEET, lightFiles, trafficLightsCss, withImport, withoutImport, type UserCss } from './logic/stylesheet.js';

const SAVED = 'traffic-lights-saved-layout';
const VERSIONS = [3, 4] as const;

/**
 * macOS traffic lights on app windows. Window buttons are drawn by the apps,
 * so this sets what they read: the button layout, with close, minimize and
 * maximize first on the left, and a user stylesheet for GTK 3 and GTK 4 that
 * draws them as the macOS lights. That covers GTK and libadwaita apps,
 * Chrome's GTK frame and the frames Mutter draws around X11 windows. Apps
 * started before read their style only once, so they change when reopened.
 */
export class TrafficLightsModule implements Module {
    private readonly wm = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
    private zoomMenu: ZoomMenu | null = null;

    constructor(private readonly settings: Gio.Settings) {}

    enable(): void {
        const layout = this.wm.get_string('button-layout');
        const mac = macLayout(layout);
        if (layout !== mac) {
            this.settings.set_string(SAVED, layout);
            this.wm.set_string('button-layout', mac);
        }
        for (const version of VERSIONS) this.guard(() => install(configDir(version), version));
        this.zoomMenu = new ZoomMenu();
    }

    disable(): void {
        this.zoomMenu?.destroy();
        this.zoomMenu = null;
        for (const version of VERSIONS) this.guard(() => uninstall(configDir(version)));
        const saved = this.settings.get_string(SAVED);
        // Put the user's layout back, unless they changed it since.
        if (saved && this.wm.get_string('button-layout') === macLayout(saved)) this.wm.set_string('button-layout', saved);
        if (saved) this.settings.set_string(SAVED, '');
    }

    /** A config folder Macr cannot write must not stop the rest. */
    private guard(step: () => void): void {
        try {
            step();
        } catch (error) {
            console.warn(`Macr traffic lights: ${error}`);
        }
    }
}

function configDir(version: 3 | 4): Gio.File {
    return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir(), `gtk-${version}.0`]));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Writes a file, replacing it, never through a link. */
function write(file: Gio.File, text: string): void {
    file.replace_contents(encoder.encode(text), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

function makeDir(dir: Gio.File): void {
    try {
        dir.make_directory_with_parents(null);
    } catch (error) {
        if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))) throw error;
    }
}

function remove(file: Gio.File): void {
    try {
        file.delete(null);
    } catch (error) {
        if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))) throw error;
    }
}

function readUserCss(file: Gio.File): UserCss {
    let info: Gio.FileInfo;
    try {
        info = file.query_info('standard::is-symlink,standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch (error) {
        if (error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return { kind: 'missing' };
        throw error;
    }
    if (info.get_is_symlink()) {
        const target = info.get_symlink_target() ?? '';
        const resolved = file.get_parent()?.resolve_relative_path(target) ?? Gio.File.new_for_path(target);
        return { kind: 'link', target, uri: resolved.get_uri() };
    }
    const [, contents] = file.load_contents(null);
    return { kind: 'file', text: decoder.decode(contents) };
}

function install(dir: Gio.File, version: 3 | 4): void {
    const assets = dir.get_child(ASSETS);
    makeDir(assets);
    for (const { name, svg } of lightFiles()) write(assets.get_child(name), svg);
    write(dir.get_child(STYLESHEET), trafficLightsCss(version));

    const gtkCss = dir.get_child('gtk.css');
    const current = readUserCss(gtkCss);
    const text = withImport(current);
    if (current.kind === 'file' && current.text === text) return;
    // The link itself goes, so the theme file it points to stays untouched.
    if (current.kind === 'link') remove(gtkCss);
    write(gtkCss, text);
}

function uninstall(dir: Gio.File): void {
    const gtkCss = dir.get_child('gtk.css');
    const current = readUserCss(gtkCss);
    if (current.kind === 'file') {
        const before = withoutImport(current.text);
        if (before.kind === 'missing') remove(gtkCss);
        else if (before.kind === 'link') {
            remove(gtkCss);
            gtkCss.make_symbolic_link(before.target, null);
        } else if (before.text !== current.text) write(gtkCss, before.text);
    }
    remove(dir.get_child(STYLESHEET));
    const assets = dir.get_child(ASSETS);
    for (const { name } of lightFiles()) remove(assets.get_child(name));
    remove(assets);
}
