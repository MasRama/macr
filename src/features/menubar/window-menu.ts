import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type { Arrangement } from '../../shared/logic/arrange.js';
import type { Placement } from '../../shared/logic/geometry.js';
import { tiler } from '../../shared/tiling-link.js';
import { appWindows, type FocusTracker } from './focus.js';
import { shortTitle } from './logic/labels.js';
import { item, menuButton, separator, submenu, type MenuLike } from './menu-kit.js';

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
        moveAndResize(menu, window);
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

/** Fill, Center, the Move & Resize submenu and Return to Previous Size, as on macOS. */
function moveAndResize(menu: PopupMenu.PopupMenu, window: Meta.Window | null): void {
    const tiling = tiler();
    const place = (label: string, placement: Placement, into: MenuLike = menu) =>
        item(into, label, () => window && tiling.place(window, placement), tiling.canPlace(window, placement));
    place(_('Fill'), 'fill');
    place(_('Center'), 'center');

    const move = submenu(menu, _('Move & Resize'));
    const halves: [string, Placement][] = [
        [_('Left'), 'left'],
        [_('Right'), 'right'],
        [_('Top'), 'top'],
        [_('Bottom'), 'bottom'],
        [_('Top Left'), 'top-left'],
        [_('Top Right'), 'top-right'],
        [_('Bottom Left'), 'bottom-left'],
        [_('Bottom Right'), 'bottom-right'],
    ];
    for (const [label, placement] of halves) place(label, placement, move.menu);
    separator(move.menu);
    const pairs: [string, Arrangement][] = [
        [_('Arrange Left & Right'), 'left-right'],
        [_('Arrange Right & Left'), 'right-left'],
        [_('Arrange Top & Bottom'), 'top-bottom'],
        [_('Arrange Bottom & Top'), 'bottom-top'],
    ];
    const canArrange = tiling.canPlace(window) && !!tiling.partner(window);
    for (const [label, kind] of pairs) item(move.menu, label, () => window && tiling.arrange(window, kind), canArrange);
    move.setSensitive(tiling.canPlace(window));

    item(menu, _('Return to Previous Size'), () => window && tiling.returnToPrevious(window), tiling.canReturn(window));
}

function bringAllToFront(focus: FocusTracker): void {
    if (!focus.app) return;
    const windows = appWindows(focus.app);
    const focused = focus.window;
    for (const window of [...windows].reverse()) if (window !== focused) window.raise();
    if (focused) Main.activateWindow(focused);
}
