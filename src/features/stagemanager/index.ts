import type { Module } from '../../shared/module.js';
import { setStageManager } from '../../shared/stage-link.js';
import { StageManager } from './stage-manager.js';

/** macOS Stage Manager: the focused app in the middle, the others as stages on the left. */
export class StageManagerModule implements Module {
    private manager: StageManager | null = null;

    enable(): void {
        this.manager = new StageManager();
        setStageManager(this.manager);
    }

    disable(): void {
        // Destroyed first: the windows it brings back are still its own until then.
        this.manager?.destroy();
        setStageManager(null);
        this.manager = null;
    }
}
