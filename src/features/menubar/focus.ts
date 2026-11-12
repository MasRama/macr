import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

/**
 * Follows the focused app and window. The desktop (icons) window counts as
 * nothing focused, as clicking the macOS desktop focuses Finder.
 */
export class FocusTracker {
    app: Shell.App | null = null;
    window: Meta.Window | null = null;

    private readonly tracker = Shell.WindowTracker.get_default();
    private readonly ids: [{ disconnect(id: number): void }, number][] = [];

    constructor(private readonly onChange: () => void) {
        this.ids.push([this.tracker, this.tracker.connect('notify::focus-app', () => this.update())]);
        this.ids.push([global.display, global.display.connect('notify::focus-window', () => this.update())]);
        this.update();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
    }

    private update(): void {
        const window = global.display.focus_window;
        const usable = window && window.get_window_type() !== Meta.WindowType.DESKTOP && !window.skip_taskbar;
        this.window = usable ? window : null;
        this.app = usable ? this.tracker.focus_app : null;
        this.onChange();
    }
}

/** The app's normal windows, most recently used first. */
export function appWindows(app: Shell.App): Meta.Window[] {
    return app.get_windows().filter((w) => !w.skip_taskbar && w.get_window_type() === Meta.WindowType.NORMAL);
}
