import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isLight } from '../../shared/scheme.js';
import { osdMargins } from './logic/place.js';

/** Logical pixels between the OSD and the menu bar or the screen edge. */
const GAP = 8;
const BLUR = 'macr-osd-blur';

/** GNOME 46's OsdWindow: an actor filling its monitor, the pill inside. */
type OsdWindow = Clutter.Actor & { _hbox: St.BoxLayout; _monitorIndex: number };
type ShowOsdWindow = (monitorIndex: number, ...rest: unknown[]) => void;
type OsdWindowManager = { _osdWindows: (OsdWindow | null)[]; _showOsdWindow: ShowOsdWindow };

/** What Macr changed on a window, to put back on destroy. */
type Saved = { xAlign: Clutter.ActorAlign; yAlign: Clutter.ActorAlign; top: number; right: number; destroyId: number };

/**
 * GNOME's OSD (volume, brightness and the other media keys) as a small
 * frosted pill under the menu bar at the top right, like macOS. GNOME's own
 * windows do the work: Macr styles and moves each one as it is shown, and
 * puts it back on destroy.
 */
export class Osd {
    private readonly manager = Main.osdWindowManager as OsdWindowManager;
    private readonly saved = new Map<OsdWindow, Saved>();

    constructor() {
        const original = this.manager._showOsdWindow;
        this.manager._showOsdWindow = (monitorIndex: number, ...rest: unknown[]) => {
            const window = this.manager._osdWindows[monitorIndex];
            if (window) this.place(window);
            original.call(this.manager, monitorIndex, ...rest);
        };
    }

    destroy(): void {
        // Drop the instance's own copy so the prototype's method shows again.
        delete (this.manager as Partial<OsdWindowManager>)._showOsdWindow;
        for (const [window, saved] of this.saved) this.restore(window, saved);
        this.saved.clear();
    }

    private place(window: OsdWindow): void {
        if (!this.saved.has(window)) this.style(window);

        const box = window._hbox;
        if (isLight()) box.add_style_class_name('macr-light');
        else box.remove_style_class_name('macr-light');

        const index = window._monitorIndex;
        const monitor = Main.layoutManager.monitors[index];
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const margins = osdMargins(monitor, Main.layoutManager.getWorkAreaForMonitor(index), GAP * scale);
        window.margin_top = margins.top;
        window.margin_right = margins.right;
    }

    private style(window: OsdWindow): void {
        this.saved.set(window, {
            xAlign: window.x_align,
            yAlign: window.y_align,
            top: window.margin_top,
            right: window.margin_right,
            destroyId: window.connect('destroy', () => this.saved.delete(window)),
        });
        window.x_align = Clutter.ActorAlign.END;
        window.y_align = Clutter.ActorAlign.START;
        window._hbox.add_style_class_name('macr-osd');
        window._hbox.add_effect_with_name(BLUR, new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));
    }

    private restore(window: OsdWindow, saved: Saved): void {
        window.disconnect(saved.destroyId);
        window.x_align = saved.xAlign;
        window.y_align = saved.yAlign;
        window.margin_top = saved.top;
        window.margin_right = saved.right;
        window._hbox.remove_style_class_name('macr-osd');
        window._hbox.remove_style_class_name('macr-light');
        window._hbox.remove_effect_by_name(BLUR);
    }
}
