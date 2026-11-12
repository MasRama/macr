import Gio from 'gi://Gio';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

/**
 * macOS Focus as a quick settings toggle: Do Not Disturb, which is GNOME's
 * "show banners" setting turned off. A moon shows in the bar while it is on.
 */
export class Focus {
    readonly indicator = new QuickSettings.SystemIndicator();
    readonly toggle: QuickSettings.QuickToggle;
    private readonly settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
    private readonly changedId: number;

    constructor() {
        const icon = this.indicator._addIndicator();
        icon.icon_name = 'weather-clear-night-symbolic';
        this.toggle = new QuickSettings.QuickToggle({ title: 'Focus', iconName: 'weather-clear-night-symbolic', toggleMode: true });
        this.settings.bind('show-banners', this.toggle, 'checked', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.changedId = this.settings.connect('changed::show-banners', () => this.sync(icon));
        this.sync(icon);
        this.indicator.quickSettingsItems.push(this.toggle);
    }

    destroy(): void {
        this.settings.disconnect(this.changedId);
        Gio.Settings.unbind(this.toggle, 'checked');
        this.toggle.destroy();
        this.indicator.quickSettingsItems.length = 0;
        this.indicator.destroy();
    }

    private sync(icon: { visible: boolean }): void {
        const on = !this.settings.get_boolean('show-banners');
        icon.visible = on;
        this.toggle.subtitle = on ? 'Do Not Disturb' : null;
    }
}
