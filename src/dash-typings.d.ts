// @girs/gnome-shell 46.0.2 has no typings for ui/dash.js. These cover the
// parts of GNOME Shell 46's Dash that the dock module uses.
declare module 'resource:///org/gnome/shell/ui/dash.js' {
    import type Clutter from 'gi://Clutter';
    import type Shell from 'gi://Shell';
    import St from 'gi://St';
    import { AppIcon } from 'resource:///org/gnome/shell/ui/appDisplay.js';

    /** Holds one dash item and its hover label. */
    export class DashItemContainer extends St.Widget {
        child: Clutter.Actor | null;
        label: St.Label | null;
        animatingOut: boolean;
        setChild(actor: Clutter.Actor): void;
        setLabelText(text: string): void;
        showLabel(): void;
        hideLabel(): void;
        show(animate?: boolean): void;
        animateOutAndDestroy(): void;
    }

    export class DashIcon extends AppIcon {
        constructor(app: Shell.App);
        /** Launches or raises the app (AppIcon.activate). */
        activate(button: number): void;
    }

    export class Dash extends St.Widget {
        iconSize: number;
        showAppsButton: St.Button;
        _box: St.Widget;
        _dashContainer: St.BoxLayout;
        _background: St.Widget;
        _showAppsIcon: DashItemContainer;
        _separator: St.Widget | null;
        _createAppItem(app: Shell.App): DashItemContainer;
        _adjustIconSize(): void;
        _hookUpLabel(item: DashItemContainer, appIcon?: AppIcon): void;
        _itemMenuStateChanged(item: DashItemContainer, opened: boolean): void;
        _queueRedisplay(): void;
        _redisplay(): void;
        _appSystem: Shell.AppSystem;
        setMaxSize(maxWidth: number, maxHeight: number): void;
    }
}
