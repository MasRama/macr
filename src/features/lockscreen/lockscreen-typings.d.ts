// @girs/gnome-shell 46.0.2 has no typings for ui/unlockDialog.js. These cover
// the parts of GNOME Shell 46's UnlockDialog that the lock screen module uses.
declare module 'resource:///org/gnome/shell/ui/unlockDialog.js' {
    import type AccountsService from 'gi://AccountsService';
    import type Clutter from 'gi://Clutter';
    import type GnomeDesktop from 'gi://GnomeDesktop';
    import type Shell from 'gi://Shell';
    import St from 'gi://St';

    /** UnlockDialogClock: time, date and the "press a key" hint. */
    export interface UnlockClock extends St.BoxLayout {
        _time: St.Label;
        _date: St.Label;
        _hint: St.Label;
        _wallClock: GnomeDesktop.WallClock;
    }

    export class UnlockDialog extends St.Widget {
        _clock: UnlockClock;
        _stack: Shell.Stack;
        _promptBox: St.BoxLayout;
        _notificationsBox: St.BoxLayout;
        _menuButtons: St.BoxLayout;
        _otherUserButton: St.Button;
        _backgroundGroup: Clutter.Actor;
        _user: AccountsService.User;
        _init(parentActor: Clutter.Actor): void;
        _setTransitionProgress(progress: number): void;
        _updateBackgroundEffects(): void;
    }
}

