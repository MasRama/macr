import type Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';

const BLUR = 'macr-switcher-blur';

/** A popup Macr styled, with what it connected on it. */
type Styled = { childId: number; destroyId: number };

/**
 * GNOME's switchers (Alt+Tab, Alt+`, Ctrl+Alt+Tab, input sources) as the
 * macOS app switcher: a frosted panel, big icons, a soft rounded highlight
 * and only the chosen app's name. The look is in the stylesheet under
 * `macr-switcher`; GNOME's popups keep all their behaviour.
 */
export class Switcher {
    private readonly styled = new Map<St.Widget, Styled>();
    private readonly addedId: number;

    constructor() {
        this.addedId = Main.uiGroup.connect('child-added', (_group: Clutter.Actor, child: Clutter.Actor) => {
            if (child instanceof St.Widget && child.has_style_class_name('switcher-popup')) this.style(child);
        });
    }

    destroy(): void {
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
