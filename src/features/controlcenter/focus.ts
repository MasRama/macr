import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { allows, bannersFor, FOCUS_MODES, type FocusMode, isFocusMode, modeForBanners, parseSchedules, scheduledMode, scheduleStep } from './logic/focus.js';

/** How often the schedules are looked at, in seconds. */
const TICK = 30;

type Menu = PopupMenu.PopupMenuBase & { setHeader(icon: Gio.Icon, title: string, subtitle?: string): void };
/** GNOME 46's per-app notification policy; its show-banners getter is what Focus changes. */
type AppPolicy = { id: string; _settings: Gio.Settings };

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

/**
 * macOS Focus in the Control Center: Do Not Disturb, Work, Personal and
 * Sleep. Any of them is GNOME's Do Not Disturb (`show-banners` off), except
 * that the apps allowed in the mode still show banners; everything still
 * reaches the Notification Center. The tile turns the last mode on or off,
 * its menu picks one, the bar shows the mode's icon, and daily schedules
 * turn modes on and off.
 */
export class Focus {
    readonly indicator = new QuickSettings.SystemIndicator();
    readonly toggle: QuickSettings.QuickMenuToggle;
    private readonly notifications = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
    private readonly icon: { visible: boolean; gicon: Gio.Icon | null };
    private readonly items = new Map<FocusMode, PopupMenu.PopupImageMenuItem>();
    private readonly ids: [Gio.Settings, number][] = [];
    private readonly bannersGetter: PropertyDescriptor | undefined;
    private timerId = 0;
    /** The mode the schedules wanted at the last look; null before the first. */
    private scheduled: FocusMode | null = null;

    constructor(
        private readonly settings: Gio.Settings,
        private readonly path: string,
    ) {
        this.icon = this.indicator._addIndicator() as unknown as { visible: boolean; gicon: Gio.Icon | null };
        this.toggle = new QuickSettings.QuickMenuToggle({ title: _('Focus'), gicon: this.modeIcon('dnd') });
        this.toggle.connect('clicked', () => this.setMode(this.active() ? '' : this.lastMode()));
        const menu = this.menu();
        for (const mode of FOCUS_MODES) {
            const item = new PopupMenu.PopupImageMenuItem(modeName(mode), this.modeIcon(mode));
            item.connect('activate', () => this.setMode(this.active() === mode ? '' : mode));
            menu.addMenuItem(item);
            this.items.set(mode, item);
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(_('Focus Settings…'), () => Extension.lookupByURL(import.meta.url)?.openPreferences());
        this.indicator.quickSettingsItems.push(this.toggle);

        // Allowed apps' banners get through while a mode is on.
        const proto = MessageTray.NotificationApplicationPolicy.prototype as object;
        this.bannersGetter = Object.getOwnPropertyDescriptor(proto, 'showBanners');
        const original = this.bannersGetter?.get;
        const active = () => this.active();
        const allowed = () => this.settings.get_strv('focus-allowed-apps');
        Object.defineProperty(proto, 'showBanners', {
            configurable: true,
            get(this: AppPolicy) {
                const mode = active();
                if (!mode) return original ? original.call(this) : true;
                return allows(allowed(), mode, this.id) && this._settings.get_boolean('show-banners');
            },
        });

        this.ids.push([settings, settings.connect('changed::focus-mode', () => this.apply())]);
        this.ids.push([settings, settings.connect('changed::focus-schedules', () => this.tick())]);
        this.ids.push([
            this.notifications,
            this.notifications.connect('changed::show-banners', () => {
                // GNOME's own Do Not Disturb switch, or gsettings.
                const mode = modeForBanners(this.notifications.get_boolean('show-banners'), this.active());
                if (mode !== null) this.setMode(mode);
            }),
        ]);
        const fromGnome = modeForBanners(this.notifications.get_boolean('show-banners'), this.active());
        if (fromGnome !== null) this.setMode(fromGnome);
        this.apply();
        this.tick();
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK, () => {
            this.tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        const proto = MessageTray.NotificationApplicationPolicy.prototype as object;
        if (this.bannersGetter) Object.defineProperty(proto, 'showBanners', this.bannersGetter);
        this.toggle.destroy();
        this.indicator.quickSettingsItems.length = 0;
        this.indicator.destroy();
    }

    private menu(): Menu {
        return (this.toggle as unknown as { menu: Menu }).menu;
    }

    private active(): FocusMode | '' {
        const mode = this.settings.get_string('focus-mode');
        return isFocusMode(mode) ? mode : '';
    }

    private lastMode(): FocusMode {
        const mode = this.settings.get_string('focus-last-mode');
        return isFocusMode(mode) ? mode : 'dnd';
    }

    private setMode(mode: FocusMode | ''): void {
        if (mode) this.settings.set_string('focus-last-mode', mode);
        if (this.settings.get_string('focus-mode') !== mode) this.settings.set_string('focus-mode', mode);
    }

    private modeIcon(mode: FocusMode): Gio.Icon {
        switch (mode) {
            case 'dnd':
                return new Gio.ThemedIcon({ name: 'weather-clear-night-symbolic' });
            case 'personal':
                return new Gio.ThemedIcon({ name: 'avatar-default-symbolic' });
            case 'work':
            case 'sleep':
                return new Gio.FileIcon({ file: Gio.File.new_for_path(`${this.path}/icons/macr-focus-${mode}-symbolic.svg`) });
        }
    }

    /** GNOME's Do Not Disturb, the tile, its menu and the bar icon follow the mode. */
    private apply(): void {
        const mode = this.active();
        const banners = bannersFor(mode);
        if (this.notifications.get_boolean('show-banners') !== banners) this.notifications.set_boolean('show-banners', banners);
        const shown = mode || this.lastMode();
        this.toggle.checked = mode !== '';
        this.toggle.gicon = this.modeIcon(shown);
        this.toggle.subtitle = mode ? modeName(mode) : null;
        this.icon.visible = mode !== '';
        this.icon.gicon = this.modeIcon(shown);
        this.menu().setHeader(this.modeIcon(shown), _('Focus'), mode ? modeName(mode) : undefined);
        for (const [at, item] of this.items) item.setOrnament(at === mode ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    private tick(): void {
        const now = GLib.DateTime.new_now_local();
        const wanted = scheduledMode(parseSchedules(this.settings.get_strv('focus-schedules')), now.get_hour() * 60 + now.get_minute());
        const step = scheduleStep(this.scheduled, wanted, this.active());
        this.scheduled = wanted;
        if (step !== null) this.setMode(step);
    }
}
