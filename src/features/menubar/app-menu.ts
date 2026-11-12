import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { AboutAppDialog } from './dialogs/about-app.js';
import { appWindows, type FocusTracker } from './focus.js';
import { appLabel } from './logic/labels.js';
import { item, menuButton, separator } from './menu-kit.js';

const FILES = 'org.gnome.Nautilus.desktop';

/** The bold app name after the logo and its menu: About, Hide, Hide Others, Show All, Quit. */
export class AppMenu {
    readonly label = new St.Label({ style_class: 'macr-app-name', y_align: Clutter.ActorAlign.CENTER });
    readonly button: PanelMenu.Button;

    constructor(private readonly focus: FocusTracker) {
        this.button = menuButton('Macr App Menu', this.label, (menu) => {
            const app = this.focus.app;
            const shown = app ?? Shell.AppSystem.get_default().lookup_app(FILES);
            const name = appLabel(app?.get_name() ?? null);
            item(menu, _('About %s').format(name), () => shown && new AboutAppDialog(shown).open(), !!shown);
            separator(menu);
            item(menu, _('Hide %s').format(name), () => app && hide(app), !!app);
            item(menu, _('Hide Others'), () => hideOthers(app));
            item(menu, _('Show All'), () => showAll());
            separator(menu);
            item(menu, _('Quit %s').format(name), () => app?.request_quit(), !!app);
        });
        this.sync();
    }

    sync(): void {
        this.label.text = appLabel(this.focus.app?.get_name() ?? null);
    }
}

function hide(app: Shell.App): void {
    for (const window of appWindows(app)) if (window.can_minimize()) window.minimize();
}

function hideOthers(keep: Shell.App | null): void {
    for (const app of Shell.AppSystem.get_default().get_running()) if (app !== keep) hide(app);
}

function showAll(): void {
    for (const app of Shell.AppSystem.get_default().get_running()) {
        for (const window of appWindows(app)) if (window.minimized) window.unminimize();
    }
}
