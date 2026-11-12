import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { appWindows, type FocusTracker } from './focus.js';
import { placeWindow, type Placement } from './logic/geometry.js';
import { shortTitle } from './logic/labels.js';
import { item, menuButton, separator, submenu } from './menu-kit.js';

/** The Window menu: size and place the focused window, and list the app's windows. */
export function windowMenu(focus: FocusTracker): PanelMenu.Button {
    const label = new St.Label({ text: _('Window'), y_align: Clutter.ActorAlign.CENTER });
    return menuButton('Macr Window Menu', label, (menu) => {
        const window = focus.window;
        const has = !!window;
        item(menu, _('Minimize'), () => window?.minimize(), !!window && window.can_minimize());
        item(menu, _('Zoom'), () => window && toggleZoom(window), !!window && window.can_maximize());
        item(menu, window?.is_fullscreen() ? _('Exit Full Screen') : _('Enter Full Screen'), () => window && toggleFullscreen(window), has);
        separator(menu);
        item(menu, _('Fill'), () => window && place(window, 'fill'), !!window && window.allows_resize());
        item(menu, _('Center'), () => window && place(window, 'center'), !!window && window.allows_move());
        item(menu, _('Move to Left Half'), () => window && place(window, 'left'), !!window && window.allows_resize());
        item(menu, _('Move to Right Half'), () => window && place(window, 'right'), !!window && window.allows_resize());
        separator(menu);
        const workspaces = submenu(menu, _('Move to Workspace'));
        const manager = global.workspace_manager;
        for (let i = 0; i < manager.get_n_workspaces(); i++) {
            const current = window?.get_workspace()?.index() === i;
            const entry = item(workspaces.menu, _('Workspace %d').format(i + 1), () => window?.change_workspace_by_index(i, false), has && !current);
            if (current) entry.setOrnament(PopupMenu.Ornament.CHECK);
        }
        workspaces.setSensitive(!!window && !window.is_on_all_workspaces());
        item(menu, _('Bring All to Front'), () => bringAllToFront(focus), !!focus.app);

        const windows = focus.app ? appWindows(focus.app) : [];
        if (windows.length > 0) separator(menu);
        for (const other of windows) {
            const entry = item(menu, shortTitle(other.get_title() ?? ''), () => Main.activateWindow(other));
            entry.setOrnament(other === window ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        }
    });
}

function toggleZoom(window: Meta.Window): void {
    if (window.get_maximized() === Meta.MaximizeFlags.BOTH) window.unmaximize(Meta.MaximizeFlags.BOTH);
    else window.maximize(Meta.MaximizeFlags.BOTH);
}

function toggleFullscreen(window: Meta.Window): void {
    if (window.is_fullscreen()) window.unmake_fullscreen();
    else window.make_fullscreen();
}

function place(window: Meta.Window, placement: Placement): void {
    if (window.is_fullscreen()) window.unmake_fullscreen();
    if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH);
    const area = window.get_work_area_current_monitor();
    const frame = window.get_frame_rect();
    const target = placeWindow(placement, area, frame);
    window.move_resize_frame(true, target.x, target.y, target.width, target.height);
}

function bringAllToFront(focus: FocusTracker): void {
    if (!focus.app) return;
    const windows = appWindows(focus.app);
    const focused = focus.window;
    for (const window of [...windows].reverse()) if (window !== focused) window.raise();
    if (focused) Main.activateWindow(focused);
}
