import Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { hideApp } from '../../shared/hider.js';
import { isLight } from '../../shared/scheme.js';
import { afterHide } from './logic/hide.js';

const BLUR = 'macr-switcher-blur';

/** A popup Macr styled, with what it connected on it. */
type Styled = { childId: number; destroyId: number };
type KeyPress = (keysym: number, action: Meta.KeyBindingAction) => boolean;
/** GNOME 46's app and window switcher popups, as far as Macr uses them. */
type Popup = {
    _items: ({ app: Shell.App } | { window: Meta.Window })[];
    _selectedIndex: number;
    _thumbnailsFocused?: boolean;
    _select(index: number): void;
    fadeAndDestroy(): void;
    _keyPressHandler: KeyPress;
};
type PopupClass = { prototype: Popup };

/** The app of a switcher item: the app itself, or the window's. */
function appOf(item: Popup['_items'][number]): Shell.App | null {
    return 'app' in item ? item.app : Shell.WindowTracker.get_default().get_window_app(item.window);
}

/**
 * H hides the chosen item's app and moves on to another app; in the window
 * switcher, Q quits the chosen window's app (the app switcher's Q is
 * GNOME's own).
 */
function macKeys(original: KeyPress, quits: boolean): KeyPress {
    return function (this: Popup, keysym: number, action: Meta.KeyBindingAction) {
        const hide = keysym === Clutter.KEY_h || keysym === Clutter.KEY_H;
        const quit = quits && (keysym === Clutter.KEY_q || keysym === Clutter.KEY_Q);
        const item = this._items[this._selectedIndex];
        if (this._thumbnailsFocused || !item || (!hide && !quit)) return original.call(this, keysym, action);
        const app = appOf(item);
        if (quit) {
            app?.request_quit();
            return Clutter.EVENT_STOP;
        }
        if (app) hideApp(app);
        const next = afterHide(this._selectedIndex, this._items.map((each) => appOf(each)?.get_id() ?? ''));
        if (next < 0) this.fadeAndDestroy();
        else this._select(next);
        return Clutter.EVENT_STOP;
    };
}

/**
 * GNOME's switchers (Alt+Tab, Alt+`, Ctrl+Alt+Tab, input sources) as the
 * macOS app switcher: a frosted panel, big icons, a soft rounded highlight
 * and only the chosen app's name. The look is in the stylesheet under
 * `macr-switcher`; GNOME's popups keep all their behaviour, and the app
 * and window switchers learn H to hide the chosen app and Q to quit it.
 */
export class Switcher {
    private readonly styled = new Map<St.Widget, Styled>();
    private readonly addedId: number;
    /** Each patched popup's own key handler, put back on destroy. */
    private readonly keyPresses = new Map<Popup, KeyPress>();

    constructor() {
        const popups: [PopupClass, boolean][] = [
            [AltTab.AppSwitcherPopup as unknown as PopupClass, false],
            [AltTab.WindowSwitcherPopup as unknown as PopupClass, true],
        ];
        for (const [{ prototype }, quits] of popups) {
            this.keyPresses.set(prototype, prototype._keyPressHandler);
            prototype._keyPressHandler = macKeys(prototype._keyPressHandler, quits);
        }

        this.addedId = Main.uiGroup.connect('child-added', (_group: Clutter.Actor, child: Clutter.Actor) => {
            if (child instanceof St.Widget && child.has_style_class_name('switcher-popup')) this.style(child);
        });
    }

    destroy(): void {
        for (const [prototype, keyPress] of this.keyPresses) prototype._keyPressHandler = keyPress;
        this.keyPresses.clear();
        Main.uiGroup.disconnect(this.addedId);
        for (const [popup, styled] of this.styled) this.unstyle(popup, styled);
        this.styled.clear();
    }

    private style(popup: St.Widget): void {
        popup.add_style_class_name('macr-switcher');
        if (isLight()) popup.add_style_class_name('macr-light');
        // GNOME adds the list when the popup shows, after it joins uiGroup.
        const childId = popup.connect('child-added', (_popup: Clutter.Actor, child: Clutter.Actor) => {
            if (child instanceof St.Widget && child.has_style_class_name('switcher-list')) blur(child);
        });
        const destroyId = popup.connect('destroy', () => this.styled.delete(popup));
        this.styled.set(popup, { childId, destroyId });
    }

    private unstyle(popup: St.Widget, styled: Styled): void {
        popup.disconnect(styled.childId);
        popup.disconnect(styled.destroyId);
        popup.remove_style_class_name('macr-switcher');
        popup.remove_style_class_name('macr-light');
        for (const child of popup.get_children()) child.remove_effect_by_name(BLUR);
    }
}

function blur(list: St.Widget): void {
    list.add_effect_with_name(BLUR, new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
}
