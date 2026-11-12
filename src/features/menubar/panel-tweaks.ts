import Gio from 'gi://Gio';
import type St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

type Indicator = { container: St.Widget };

const BLUR_NAME = 'macr-blur';

/**
 * The bar itself: Macr's style classes and background blur on Main.panel,
 * and GNOME's own items that a macOS menu bar does not have hidden. Every
 * change is undone by destroy().
 */
export class PanelTweaks {
    private readonly hidden = new Map<St.Widget, number>();
    private readonly interface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    private readonly ids: [{ disconnect(id: number): void }, number][] = [];

    constructor(private readonly settings: Gio.Settings) {
        const panel = Main.panel;
        panel.add_style_class_name('macr-bar');
        panel.add_effect_with_name(BLUR_NAME, new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.9 }));

        this.ids.push([this.interface, this.interface.connect('changed::color-scheme', () => this.syncScheme())]);
        this.ids.push([settings, settings.connect('changed::hide-distro-menu-button', () => this.syncHidden())]);
        // Extensions that load after Macr (Zorin Menu) add their button later.
        const left = (panel as unknown as { _leftBox: St.BoxLayout })._leftBox;
        this.ids.push([left, left.connect('child-added', () => this.syncHidden())]);
        this.syncScheme();
        this.syncHidden();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        for (const widget of [...this.hidden.keys()]) this.unhide(widget);
        Main.panel.remove_effect_by_name(BLUR_NAME);
        Main.panel.remove_style_class_name('macr-bar');
        Main.panel.remove_style_class_name('macr-light');
    }

    private syncScheme(): void {
        const light = this.interface.get_string('color-scheme') !== 'prefer-dark';
        if (light) Main.panel.add_style_class_name('macr-light');
        else Main.panel.remove_style_class_name('macr-light');
    }

    private syncHidden(): void {
        const status = Main.panel.statusArea as unknown as Record<string, Indicator | undefined>;
        const roles = ['activities', 'dateMenu'];
        if (this.settings.get_boolean('hide-distro-menu-button')) roles.push('zorin-menu');
        const wanted = new Set(roles.map((role) => status[role]?.container).filter((w): w is St.Widget => !!w));
        for (const widget of [...this.hidden.keys()]) if (!wanted.has(widget)) this.unhide(widget);
        for (const widget of wanted) if (!this.hidden.has(widget)) this.hide(widget);
    }

    // Hidden, never destroyed: other extensions (Nokta) still use these items.
    // If something shows one again (Just Perfection), it is hidden again.
    private hide(widget: St.Widget): void {
        widget.hide();
        const id = widget.connect('notify::visible', () => {
            if (widget.visible) widget.hide();
        });
        this.hidden.set(widget, id);
    }

    private unhide(widget: St.Widget): void {
        const id = this.hidden.get(widget);
        this.hidden.delete(widget);
        if (id) widget.disconnect(id);
        widget.show();
    }
}
