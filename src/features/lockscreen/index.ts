import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { UnlockDialog } from 'resource:///org/gnome/shell/ui/unlockDialog.js';

import type { Module } from '../../shared/module.js';
import { MacLock } from './mac-lock.js';

type Proto = {
    _init(this: UnlockDialog, ...args: unknown[]): void;
    _setTransitionProgress(this: UnlockDialog, progress: number): void;
    _updateBackgroundEffects(this: UnlockDialog): void;
};

/**
 * The macOS lock screen. GNOME builds its unlock dialog each time the screen
 * locks, so the module hooks the dialog's class while on: every new dialog
 * becomes a MacLock, and one already showing is turned over at once.
 */
export class LockScreenModule implements Module {
    private readonly locks = new Map<UnlockDialog, MacLock>();
    private original: Proto | null = null;

    enable(): void {
        const proto = UnlockDialog.prototype as unknown as Proto;
        const original: Proto = {
            _init: proto._init,
            _setTransitionProgress: proto._setTransitionProgress,
            _updateBackgroundEffects: proto._updateBackgroundEffects,
        };
        this.original = original;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const module = this;
        proto._init = function (...args) {
            original._init.apply(this, args);
            module.take(this);
        };
        proto._setTransitionProgress = function (progress) {
            const lock = module.locks.get(this);
            if (lock) lock.transition(progress);
            else original._setTransitionProgress.call(this, progress);
        };
        proto._updateBackgroundEffects = function () {
            original._updateBackgroundEffects.call(this);
            module.locks.get(this)?.updateBackground();
        };

        const showing = (Main as unknown as { screenShield?: { _dialog?: UnlockDialog | null } }).screenShield?._dialog;
        if (showing) this.take(showing);
    }

    disable(): void {
        if (this.original) Object.assign(UnlockDialog.prototype, this.original);
        this.original = null;
        for (const lock of this.locks.values()) lock.undo();
        this.locks.clear();
    }

    private take(dialog: UnlockDialog): void {
        this.locks.set(dialog, new MacLock(dialog));
        dialog.connect('destroy', () => this.locks.delete(dialog));
    }
}
