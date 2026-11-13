import Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { hiddenTiles, TILES, type TileId, withTile } from '../features/controlcenter/logic/tiles.js';

function tileName(tile: TileId): string {
    switch (tile) {
        case 'wifi':
            return _('Wi-Fi');
        case 'bluetooth':
            return _('Bluetooth');
        case 'focus':
            return _('Focus');
        case 'stage-manager':
            return _('Stage Manager');
        case 'now-playing':
            return _('Now Playing');
        case 'airplane-mode':
            return _('Airplane Mode');
        case 'night-light':
            return _('Night Light');
        case 'dark-style':
            return _('Dark Style');
        case 'power-mode':
            return _('Power Mode');
        case 'display':
            return _('Display');
        case 'sound':
            return _('Sound');
        case 'microphone':
            return _('Microphone');
    }
}

/** Show or hide each Control Center tile. */
export function tilesGroup(settings: Gio.Settings, onClose: (cleanup: () => void) => void): Adw.PreferencesGroup {
    const box = new Adw.PreferencesGroup({ title: _('Tiles'), description: _('The tiles the Control Center shows') });
    const rows = new Map<TileId, Adw.SwitchRow>();
    let syncing = false;
    for (const tile of TILES) {
        const row = new Adw.SwitchRow({ title: tileName(tile) });
        row.connect('notify::active', () => {
            if (syncing) return;
            settings.set_strv('control-center-hidden', withTile(settings.get_strv('control-center-hidden'), tile, row.active));
        });
        rows.set(tile, row);
        box.add(row);
    }
    const sync = () => {
        syncing = true;
        const hidden = hiddenTiles(settings.get_strv('control-center-hidden'));
        for (const [tile, row] of rows) row.active = !hidden.has(tile);
        syncing = false;
    };
    sync();
    const id = settings.connect('changed::control-center-hidden', sync);
    onClose(() => settings.disconnect(id));
    return box;
}
