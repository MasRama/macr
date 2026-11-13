import type { Module } from '../../shared/module.js';
import { ShakeToFind } from './shake-to-find.js';

/** Shake the pointer to find it. */
export class ShakeToFindModule implements Module {
    private shake: ShakeToFind | null = null;

    enable(): void {
        this.shake = new ShakeToFind();
    }

    disable(): void {
        this.shake?.destroy();
        this.shake = null;
    }
}
