import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { AboutComputerDialog } from './dialogs/about-computer.js';
import { ForceQuitDialog } from './dialogs/force-quit.js';
import { recentFiles } from './logic/recent.js';
import { groups, item, launchApp, menuButton, submenu } from './menu-kit.js';

const APPLE_GLYPH = '\uF8FF';

// misc/systemActions.js; the @girs typings for 46 lack the activate* methods.
interface Actions {
    canSuspend: boolean;
    canRestart: boolean;
    canPowerOff: boolean;
    canLockScreen: boolean;
    canLogout: boolean;
    activateSuspend(): void;
    activateRestart(): void;
    activatePowerOff(): void;
    activateLockScreen(): void;
    activateLogout(): void;
}

/**
 * The logo at the left end. The Apple glyph comes from an installed SF Pro
 * font (Macr ships no Apple artwork); without it, the distribution's logo.
 */
function logo(): Clutter.Actor {
    const families = PangoCairo.FontMap.get_default().list_families().map((f) => f.get_name());
    const font = ['SF Pro', 'SF Pro Text', 'SF Pro Display'].find((name) => families.includes(name));
    if (font) {
        return new St.Label({ text: APPLE_GLYPH, style_class: 'macr-logo', style: `font-family: "${font}";`, y_align: Clutter.ActorAlign.CENTER });
    }
    return new St.Icon({ icon_name: 'start-here-symbolic', style_class: 'macr-logo-icon' });
}

export function logoMenu(): PanelMenu.Button {
    return menuButton('Macr Logo Menu', logo(), (menu) => {
        const actions = SystemActions.getDefault() as unknown as Actions;
        groups(
            menu,
            (g) => item(g, _('About This Computer'), () => new AboutComputerDialog().open()),
            (g) => {
                item(g, _('System Settings…'), () => launchApp('org.gnome.Settings.desktop'));
                if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop')) {
                    item(g, _('App Store…'), () => launchApp('org.gnome.Software.desktop'));
                }
            },
            (g) => fillRecent(submenu(g, _('Recent Items'))),
            (g) => item(g, _('Force Quit…'), () => new ForceQuitDialog().open()),
            (g) => {
                if (actions.canSuspend) item(g, _('Sleep'), () => actions.activateSuspend());
                if (actions.canRestart) item(g, _('Restart…'), () => actions.activateRestart());
                if (actions.canPowerOff) item(g, _('Shut Down…'), () => actions.activatePowerOff());
            },
            (g) => {
                if (actions.canLockScreen) item(g, _('Lock Screen'), () => actions.activateLockScreen());
                const user = GLib.get_real_name() || GLib.get_user_name();
                if (actions.canLogout) item(g, _('Log Out %s…').format(user), () => actions.activateLogout());
            },
        );
    });
}

function fillRecent(entry: PopupMenu.PopupSubMenuMenuItem): void {
    const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
    let text = '';
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (ok) text = new TextDecoder().decode(bytes);
    } catch {
        // No recent files yet.
    }
    const files = recentFiles(text, 25).filter((f) => Gio.File.new_for_uri(f.uri).query_exists(null)).slice(0, 10);
    if (files.length === 0) {
        item(entry.menu, _('No Recent Items'), () => {}, false);
        return;
    }
    for (const file of files) {
        item(entry.menu, file.name, () => {
            Gio.AppInfo.launch_default_for_uri(file.uri, global.create_app_launch_context(0, -1));
        });
    }
}
