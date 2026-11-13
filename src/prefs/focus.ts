import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { allowedApps, FOCUS_MODES, type FocusMode, parseSchedules, type Schedule, withAllowed, withSchedule } from '../features/controlcenter/logic/focus.js';

/** Schedule times on offer: every half hour. */
const TIMES = Array.from({ length: 48 }, (_, at) => at * 30);

function modeName(mode: FocusMode): string {
    switch (mode) {
        case 'dnd':
            return _('Do Not Disturb');
        case 'work':
            return _('Work');
        case 'personal':
            return _('Personal');
        case 'sleep':
            return _('Sleep');
    }
}

function modeIcon(mode: FocusMode, path: string): Gio.Icon {
    if (mode === 'dnd') return new Gio.ThemedIcon({ name: 'weather-clear-night-symbolic' });
    if (mode === 'personal') return new Gio.ThemedIcon({ name: 'avatar-default-symbolic' });
    return new Gio.FileIcon({ file: Gio.File.new_for_path(`${path}/icons/macr-focus-${mode}-symbolic.svg`) });
}

function clock(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The apps a user can pick, A to Z. */
function apps(): Gio.AppInfo[] {
    return Gio.AppInfo.get_all()
        .filter((app) => app.should_show() && app.get_id())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
}

/**
 * Focus on the Control Center page: per mode, the apps whose banners still
 * show and a daily schedule.
 */
export function focusGroup(settings: Gio.Settings, path: string, onClose: (cleanup: () => void) => void): Adw.PreferencesGroup {
    const box = new Adw.PreferencesGroup({ title: _('Focus'), description: _('Banners stay quiet while a mode is on, except from the apps you allow; everything still reaches the Notification Center') });
    const all = apps();
    for (const mode of FOCUS_MODES) box.add(modeRow(settings, mode, path, all, onClose));
    return box;
}

function modeRow(settings: Gio.Settings, mode: FocusMode, path: string, all: Gio.AppInfo[], onClose: (cleanup: () => void) => void): Adw.ExpanderRow {
    const row = new Adw.ExpanderRow({ title: modeName(mode) });
    row.add_prefix(new Gtk.Image({ gicon: modeIcon(mode, path) }));

    // The schedule: on or off, from, to.
    const schedule = (): Schedule => parseSchedules(settings.get_strv('focus-schedules')).find((one) => one.mode === mode) ?? { mode, on: false, start: 22 * 60, end: 7 * 60 };
    const save = (change: Partial<Schedule>) => settings.set_strv('focus-schedules', withSchedule(settings.get_strv('focus-schedules'), { ...schedule(), ...change }));
    const scheduled = new Adw.SwitchRow({ title: _('Turn on by schedule'), subtitle: _('Every day') });
    const times = Gtk.StringList.new(TIMES.map(clock));
    const from = new Adw.ComboRow({ title: _('From'), model: times });
    const to = new Adw.ComboRow({ title: _('To'), model: times });
    const nearest = (minutes: number) => Math.round(minutes / 30) % TIMES.length;
    let syncing = false;
    const syncSchedule = () => {
        syncing = true;
        const now = schedule();
        scheduled.active = now.on;
        from.selected = nearest(now.start);
        to.selected = nearest(now.end);
        from.sensitive = to.sensitive = now.on;
        row.subtitle = now.on ? `${clock(now.start)} – ${clock(now.end)}` : '';
        syncing = false;
    };
    scheduled.connect('notify::active', () => !syncing && save({ on: scheduled.active }));
    from.connect('notify::selected', () => !syncing && save({ start: TIMES[from.selected] }));
    to.connect('notify::selected', () => !syncing && save({ end: TIMES[to.selected] }));
    for (const child of [scheduled, from, to]) row.add_row(child);

    // The allowed apps, then a drop-down to allow one more.
    let appRows: Adw.ActionRow[] = [];
    let choicesAdded = false;
    const choices = new Adw.ComboRow({ title: _('Allow notifications from'), model: Gtk.StringList.new([_('Choose an App…'), ...all.map((app) => app.get_display_name())]) });
    choices.connect('notify::selected', () => {
        const app = all[choices.selected - 1];
        if (!app || syncing) return;
        settings.set_strv('focus-allowed-apps', withAllowed(settings.get_strv('focus-allowed-apps'), mode, app.get_id() ?? '', true));
    });
    const syncApps = () => {
        for (const old of appRows) row.remove(old);
        if (choicesAdded) row.remove(choices);
        appRows = allowedApps(settings.get_strv('focus-allowed-apps'), mode).map((id) => {
            const app = all.find((one) => one.get_id() === id);
            const appRow = new Adw.ActionRow({ title: app?.get_display_name() ?? id, subtitle: _('Allowed') });
            const icon = app?.get_icon();
            appRow.add_prefix(icon ? new Gtk.Image({ gicon: icon, pixel_size: 24 }) : new Gtk.Image({ icon_name: 'application-x-executable-symbolic' }));
            const remove = new Gtk.Button({ icon_name: 'list-remove-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _('Remove'), css_classes: ['flat'] });
            remove.connect('clicked', () => settings.set_strv('focus-allowed-apps', withAllowed(settings.get_strv('focus-allowed-apps'), mode, id, false)));
            appRow.add_suffix(remove);
            row.add_row(appRow);
            return appRow;
        });
        row.add_row(choices);
        choicesAdded = true;
        syncing = true;
        choices.selected = 0;
        syncing = false;
    };

    syncSchedule();
    syncApps();
    const ids = [settings.connect('changed::focus-schedules', syncSchedule), settings.connect('changed::focus-allowed-apps', syncApps)];
    onClose(() => ids.forEach((id) => settings.disconnect(id)));
    return row;
}
