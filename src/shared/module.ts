import type Gio from 'gi://Gio';

import type { Screen } from './logic/screen.js';

/**
 * One Macr module (menu bar, later dock, launchpad...). The extension turns
 * it on and off as its GSettings switch changes; disable() must undo
 * everything enable() did.
 */
export interface Module {
    enable(): void;
    disable(): void;
}

export interface ModuleContext {
    settings: Gio.Settings;
    /** The extension's folder, for icons and other files it ships. */
    path: string;
}

export interface ModuleEntry {
    /** The boolean GSettings key that turns the module on. */
    key: string;
    /** Where it runs; the desktop only when left out. */
    screens?: Screen[];
    create(context: ModuleContext): Module;
}
