import type { Module } from '../../shared/module.js';
import { Notifications } from './notifications.js';

/** Banners at the top right and the macOS Notification Center look. */
export class NotificationsModule implements Module {
    private notifications: Notifications | null = null;

    enable(): void {
        this.notifications = new Notifications();
    }

    disable(): void {
        this.notifications?.destroy();
        this.notifications = null;
    }
}
