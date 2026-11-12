import type { Module, ModuleContext } from '../../shared/module.js';

/** Turns GNOME's top bar into a macOS menu bar. */
export class MenuBar implements Module {
    constructor(private readonly context: ModuleContext) {}

    enable(): void {
        void this.context;
    }

    disable(): void {}
}
