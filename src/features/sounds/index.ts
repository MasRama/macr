import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { Module, ModuleContext } from '../../shared/module.js';
import { THEME, indexTheme, takeTheme } from './logic/theme.js';

/** The user's sound theme from before Macr's; empty when nothing is saved. */
const SAVED = 'sounds-saved-theme';

/**
 * macOS-style system sounds: a pop when the volume changes, a shutter for
 * screenshots, a crumple when the Trash is emptied, a chime when power is
 * plugged in, and softer alerts and notifications. They are a sound theme
 * Macr links into the user's data folder and picks in
 * org.gnome.desktop.sound, so GNOME and apps play them through libcanberra;
 * the user's own theme covers the rest and comes back on disable.
 */
export class SoundsModule implements Module {
    private readonly sound = new Gio.Settings({ schema_id: 'org.gnome.desktop.sound' });
    private readonly folder = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'sounds', THEME]));

    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        const settings = this.context.settings;
        const plan = takeTheme(this.sound.get_string('theme-name'));
        if (plan.save !== null) settings.set_string(SAVED, plan.save);
        try {
            this.install(settings.get_string(SAVED));
        } catch (error) {
            console.warn(`Macr: could not install the sound theme: ${error}`);
            return;
        }
        if (plan.switchTo) this.sound.set_string('theme-name', plan.switchTo);
    }

    disable(): void {
        const settings = this.context.settings;
        const saved = settings.get_string(SAVED);
        if (this.sound.get_string('theme-name') === THEME) {
            if (saved) this.sound.set_string('theme-name', saved);
            else this.sound.reset('theme-name');
        }
        settings.set_string(SAVED, '');
        this.uninstall();
    }

    /** index.theme, and stereo/ as a link to the sounds Macr ships. */
    private install(inherits: string): void {
        this.uninstall();
        this.folder.make_directory_with_parents(null);
        const index = this.folder.get_child('index.theme');
        index.replace_contents(new TextEncoder().encode(indexTheme(inherits)), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        this.folder.get_child('stereo').make_symbolic_link(GLib.build_filenamev([this.context.path, 'sounds', 'stereo']), null);
    }

    private uninstall(): void {
        for (const name of ['index.theme', 'stereo']) {
            try {
                this.folder.get_child(name).delete(null);
            } catch {
                // Not there.
            }
        }
        try {
            this.folder.delete(null);
        } catch {
            // Not there, or holds files that are not Macr's.
        }
    }
}
