import type Gio from 'gi://Gio';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { type Clash, clashes, toTell } from './logic/clashes.js';
import { screenOf } from './logic/screen.js';

type Disconnectable = { disconnect(id: number): void };

/** ExtensionState.ACTIVE in GNOME 46 (the typings call it ENABLED). */
const ACTIVE = 1;

/** The part of the desktop a clashing extension fights Macr over. */
function partName(setting: string): string {
    const names: Record<string, string> = {
        'dock-enabled': _('the dock'),
        'dock-genie': _('the genie minimize'),
        'menubar-enabled': _('the menu bar'),
        'window-corners-enabled': _('rounded corners'),
        'tiling-enabled': _('window tiling'),
    };
    return names[setting] ?? setting;
}

/**
 * Tells the user, with a notification, about each running extension that
 * wholly clashes with a Macr module that is on: when Macr starts (at
 * login) and when a clashing extension or module is turned on. Each clash
 * is told once while it lasts, and its notification goes when it ends.
 */
export class ClashNotice {
    private readonly ids: [Disconnectable, number][] = [];
    private told = new Set<string>();
    private readonly shown = new Map<string, MessageTray.Notification>();
    private source: MessageTray.Source | null = null;

    constructor(
        private readonly settings: Gio.Settings,
        private readonly openSettings: () => void,
    ) {
        const check = () => this.check();
        const manager = Main.extensionManager as unknown as Disconnectable & { connect(signal: string, callback: () => void): number };
        this.ids.push([manager, manager.connect('extension-state-changed', check)]);
        this.ids.push([settings, settings.connect('changed', check)]);
        this.ids.push([Main.sessionMode, Main.sessionMode.connect('updated', check)]);
        // At login, after the shell has started, so the banner is seen.
        if (Main.layoutManager._startingUp) this.ids.push([Main.layoutManager, Main.layoutManager.connect('startup-complete', check)]);
        else check();
    }

    destroy(): void {
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        this.source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this.source = null;
        this.shown.clear();
    }

    private check(): void {
        if (Main.layoutManager._startingUp || screenOf(Main.sessionMode) !== 'desktop') return;
        const manager = Main.extensionManager;
        const running = manager.getUuids().filter((uuid) => manager.lookup(uuid)?.state === ACTIVE);
        const schema = this.settings.settings_schema;
        // A partial clash may be settled inside the other extension, which Macr
        // cannot see: told every login it would never stop. Settings lists it.
        const found = clashes(running, (key) => schema.has_key(key) && this.settings.get_boolean(key)).filter((clash) => !clash.partial);
        for (const [uuid, notification] of this.shown) {
            if (found.some((clash) => clash.uuid === uuid)) continue;
            this.shown.delete(uuid);
            notification.destroy();
        }
        const step = toTell(found, this.told);
        this.told = step.told;
        for (const clash of step.tell) this.tell(clash);
    }

    private tell(clash: Clash): void {
        const part = partName(clash.setting);
        const notification = new MessageTray.Notification({
            source: this.ensureSource(),
            title: _('%s clashes with Macr').format(clash.name),
            body: _('Turn it off, or the two fight over %s.').format(part),
        });
        notification.addAction(_('Turn Off %s').format(clash.name), () => Main.extensionManager.disableExtension(clash.uuid));
        notification.addAction(_('Macr Settings'), () => this.openSettings());
        notification.connect('activated', () => this.openSettings());
        notification.connect('destroy', () => {
            if (this.shown.get(clash.uuid) === notification) this.shown.delete(clash.uuid);
        });
        this.shown.set(clash.uuid, notification);
        this.source!.addNotification(notification);
    }

    /** Macr's notification source; GNOME drops it once its last notification goes. */
    private ensureSource(): MessageTray.Source {
        if (this.source) return this.source;
        const source = new MessageTray.Source({ title: 'Macr', iconName: 'dialog-warning-symbolic' });
        source.connect('destroy', () => {
            if (this.source === source) this.source = null;
        });
        Main.messageTray.add(source);
        this.source = source;
        return source;
    }
}
