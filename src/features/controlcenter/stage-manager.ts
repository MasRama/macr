import Gio from 'gi://Gio';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const KEY = 'stage-manager-enabled';

/** A quick settings toggle that turns Macr's Stage Manager on and off, as in macOS's Control Center. */
export class StageManagerToggle {
    readonly indicator = new QuickSettings.SystemIndicator();
    readonly toggle: QuickSettings.QuickToggle;

    constructor(
        private readonly settings: Gio.Settings,
        extensionPath: string,
    ) {
        const gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(`${extensionPath}/icons/macr-stage-manager-symbolic.svg`) });
        this.toggle = new QuickSettings.QuickToggle({ title: _('Stage Manager'), gicon, toggleMode: true });
        this.settings.bind(KEY, this.toggle, 'checked', Gio.SettingsBindFlags.DEFAULT);
        this.indicator.quickSettingsItems.push(this.toggle);
    }

    destroy(): void {
        Gio.Settings.unbind(this.toggle, 'checked');
        this.toggle.destroy();
        this.indicator.quickSettingsItems.length = 0;
        this.indicator.destroy();
    }
}
