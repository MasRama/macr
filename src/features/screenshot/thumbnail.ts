import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { CornerEffect } from '../../shared/corner-effect.js';
import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { isLight } from '../../shared/scheme.js';
import { newestScreenshot, type FileStamp } from './logic/files.js';
import { fitSize, releaseAction, swipeOffset, thumbnailPosition } from './logic/thumbnail.js';

/** The icon of the source GNOME makes for each screenshot (not for screencasts). */
const SCREENSHOT_ICON = 'screenshot-recorded-symbolic';
const SETTING = 'screenshot-thumbnail';
/** How long the thumbnail stays when left alone, in milliseconds. */
const STAY = 5000;
/** The largest thumbnail and its gap to the work area's edge, in logical pixels. */
const MAX_SIZE = { width: 220, height: 150 };
const MARGIN = 16;
/** The picture's corner, inside the frame's 1px border with its 8px corner. */
const RADIUS = 7;
const SLIDE = 250;

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number };

/**
 * macOS's floating thumbnail: after each screenshot, a small copy of it at
 * the bottom right for about five seconds instead of GNOME's banner. A click
 * opens the picture, a swipe to the right puts it away, and its menu copies,
 * shows or deletes the file. GNOME still saves, copies and notifies: Macr
 * acknowledges the notification so no banner shows, and removes it when the
 * thumbnail goes.
 */
export class Thumbnails {
    private readonly sources = new Map<MessageTray.Source, number[]>();
    private readonly trayId: number;
    private current: Thumbnail | null = null;

    constructor(private readonly settings: Gio.Settings) {
        this.trayId = Main.messageTray.connect('source-added', (_tray: unknown, source: MessageTray.Source) => this.watch(source));
    }

    destroy(): void {
        Main.messageTray.disconnect(this.trayId);
        for (const [source, ids] of this.sources) for (const id of ids) source.disconnect(id);
        this.sources.clear();
        this.dismiss();
    }

    /** The file of the screenshot just taken, when GNOME hands it over. */
    fileTaken(file: Gio.File | null | undefined): void {
        if (file && this.current) this.current.file = file;
    }

    /** Takes the thumbnail away at once, so it is not in the next screenshot. */
    dismiss(): void {
        this.current?.destroy();
        this.current = null;
    }

    private watch(source: MessageTray.Source): void {
        if (iconName(source) !== SCREENSHOT_ICON) return;
        const ids = [
            source.connect('notification-added', (_source: MessageTray.Source, notification: MessageTray.Notification) => this.show(notification)),
            source.connect('destroy', () => this.sources.delete(source)),
        ];
        this.sources.set(source, ids);
    }

    /** Runs before GNOME asks for a banner, so acknowledging it here keeps the banner away. */
    private show(notification: MessageTray.Notification): void {
        if (!this.settings.get_boolean(SETTING) || Main.sessionMode.isLocked) return;
        if (!(notification.gicon instanceof St.ImageContent)) return;
        notification.acknowledged = true;
        this.dismiss();
        const thumbnail = new Thumbnail(notification, notification.gicon, newestFile());
        thumbnail.onGone = () => {
            if (this.current === thumbnail) this.current = null;
        };
        this.current = thumbnail;
    }
}

/** One thumbnail on the screen, with its timer, swipe and menu. */
class Thumbnail {
    file: Gio.File | null;
    onGone: () => void = () => {};
    private readonly frame: St.Bin;
    private readonly menu: PopupMenu.PopupMenu;
    private readonly menuManager: PopupMenu.PopupMenuManager;
    private readonly width: number;
    private notification: MessageTray.Notification | null;
    private notificationId = 0;
    private timeoutId = 0;
    private grab: Clutter.Grab | null = null;
    private press: { x: number; y: number; time: number } | null = null;
    private leaving = false;
    private destroyed = false;

    constructor(notification: MessageTray.Notification, content: St.ImageContent, file: Gio.File | null) {
        this.file = file;
        this.notification = notification;
        this.notificationId = notification.connect('destroy', () => {
            this.notification = null;
            this.notificationId = 0;
        });

        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
        const [, imageWidth, imageHeight] = content.get_preferred_size();
        const size = fitSize({ width: imageWidth, height: imageHeight }, { width: MAX_SIZE.width * scale, height: MAX_SIZE.height * scale });
        const image = new Clutter.Actor({ content, width: size.width, height: size.height });
        image.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
        const corners = new CornerEffect();
        image.add_effect(corners);
        corners.setShape([0, 0, size.width, size.height], RADIUS * scale, size.width, size.height);

        this.frame = new St.Bin({ style_class: 'macr-screenshot-thumb', child: image, reactive: true, track_hover: true });
        if (isLight()) this.frame.add_style_class_name('macr-light');
        this.frame.accessible_name = _('Screenshot');
        Main.layoutManager.addTopChrome(this.frame);
        // The border adds a pixel each side.
        const frameSize = { width: size.width + 2 * scale, height: size.height + 2 * scale };
        const position = thumbnailPosition(Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex), frameSize, MARGIN * scale);
        this.frame.set_position(position.x, position.y);
        this.width = frameSize.width + MARGIN * scale;
        this.frame.translation_x = this.width;
        this.frame.ease({ translation_x: 0, duration: SLIDE, mode: Clutter.AnimationMode.EASE_OUT_QUAD });

        this.menu = new PopupMenu.PopupMenu(this.frame, 0.5, St.Side.BOTTOM);
        styleMenu(this.menu);
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this.menuManager = new PopupMenu.PopupMenuManager(this.frame, {});
        this.menuManager.addMenu(this.menu, -1);
        (this.menu as unknown as Signals).connect('open-state-changed', (_menu: never, open: boolean) => {
            if (open) this.stopTimer();
            else if (!this.frame.hover) this.startTimer();
        });

        this.frame.connect('notify::hover', () => {
            if (this.frame.hover) this.stopTimer();
            else if (!this.menu.isOpen && !this.press) this.startTimer();
        });
        this.frame.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onPress(event));
        this.frame.connect('motion-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onMotion(event));
        this.frame.connect('button-release-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onRelease(event));
        this.startTimer();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stopTimer();
        this.endGrab();
        this.menuManager.removeMenu(this.menu);
        this.menu.destroy();
        this.frame.remove_all_transitions();
        Main.layoutManager.removeChrome(this.frame);
        this.frame.destroy();
        // GNOME's notification is transient: without its banner nothing else would remove it.
        const notification = this.notification;
        if (notification) {
            notification.disconnect(this.notificationId);
            this.notification = null;
            notification.destroy();
        }
        this.onGone();
    }

    private startTimer(): void {
        this.stopTimer();
        // The menu closing as the thumbnail goes would start it again.
        if (this.leaving || this.destroyed) return;
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, STAY, () => {
            this.timeoutId = 0;
            this.leave();
            return GLib.SOURCE_REMOVE;
        });
    }

    private stopTimer(): void {
        if (this.timeoutId) GLib.source_remove(this.timeoutId);
        this.timeoutId = 0;
    }

    /** Slides out to the right, then goes. */
    private leave(): void {
        if (this.leaving || this.destroyed) return;
        this.leaving = true;
        this.stopTimer();
        this.frame.reactive = false;
        this.frame.ease({
            translation_x: this.width,
            duration: SLIDE,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => this.destroy(),
        });
    }

    private onPress(event: Clutter.Event): boolean {
        if (this.leaving) return Clutter.EVENT_STOP;
        const button = event.get_button();
        if (button === Clutter.BUTTON_SECONDARY) {
            this.openMenu();
            return Clutter.EVENT_STOP;
        }
        if (button !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this.press = { x, y, time: event.get_time() };
        this.stopTimer();
        this.frame.remove_all_transitions();
        this.grab = (global.stage as Clutter.Stage).grab(this.frame);
        return Clutter.EVENT_STOP;
    }

    private onMotion(event: Clutter.Event): boolean {
        if (!this.press) return Clutter.EVENT_PROPAGATE;
        const [x] = event.get_coords();
        this.frame.translation_x = swipeOffset(x - this.press.x);
        return Clutter.EVENT_STOP;
    }

    private onRelease(event: Clutter.Event): boolean {
        const press = this.press;
        if (!press || event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        this.press = null;
        this.endGrab();
        const [x, y] = event.get_coords();
        const action = releaseAction({ dx: x - press.x, dy: y - press.y, ms: event.get_time() - press.time }, this.width);
        if (action === 'click') {
            this.open();
        } else if (action === 'dismiss') {
            this.leave();
        } else {
            this.frame.ease({ translation_x: 0, duration: SLIDE, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            if (!this.frame.hover) this.startTimer();
        }
        return Clutter.EVENT_STOP;
    }

    private endGrab(): void {
        this.grab?.dismiss();
        this.grab = null;
    }

    /** Opens the picture as GNOME's notification would, then goes. */
    private open(): void {
        const notification = this.notification;
        if (notification) {
            // Activating destroys it; Macr no longer has to.
            notification.disconnect(this.notificationId);
            this.notification = null;
            notification.activate();
        } else if (this.file) {
            launch(() => Gio.AppInfo.launch_default_for_uri(this.file!.get_uri(), global.create_app_launch_context(0, -1)));
        }
        this.destroy();
    }

    private openMenu(): void {
        this.menu.removeAll();
        const file = this.file;
        const item = (label: string, action: () => void) => {
            const menuItem = new PopupMenu.PopupMenuItem(label);
            menuItem.connect('activate', action);
            this.menu.addMenuItem(menuItem);
        };
        // With saving to disk locked down, GNOME keeps no file: only the clipboard has it.
        if (file) {
            item(_('Copy'), () => {
                copy(file);
                this.leave();
            });
            item(_('Show in Files'), () => {
                showInFiles(file);
                this.destroy();
            });
            item(_('Delete'), () => {
                file.trash_async(GLib.PRIORITY_DEFAULT, null, (_file, result) => {
                    try {
                        file.trash_finish(result);
                    } catch (error) {
                        logError(error as Error, 'Macr: could not move the screenshot to the Trash');
                    }
                });
                this.destroy();
            });
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        item(_('Close'), () => this.leave());
        syncMenuScheme(this.menu);
        this.menu.open(true);
    }
}

/** GNOME 46's `iconName` getter misses the icon GNOME gives the screenshot source: its themed icon names it. */
function iconName(source: MessageTray.Source): string | null {
    const icon = (source as unknown as { icon?: Gio.Icon | null }).icon;
    return source.iconName ?? icon?.to_string() ?? null;
}

/** GNOME's screenshots folder, as `_storeScreenshot` names it; null when saving to disk is locked down. */
function screenshotsFolder(): Gio.File | null {
    const lockdown = new Gio.Settings({ schema_id: 'org.gnome.desktop.lockdown' });
    if (lockdown.get_boolean('disable-save-to-disk')) return null;
    const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) || GLib.get_home_dir();
    // GNOME's own translation of the folder name.
    return Gio.File.new_for_path(GLib.build_filenamev([pictures, GLib.dgettext('gnome-shell', 'Screenshots')]));
}

/**
 * The file GNOME just saved. It is written before the notification is
 * added, so the newest PNG in the folder is it.
 */
function newestFile(): Gio.File | null {
    const folder = screenshotsFolder();
    if (!folder) return null;
    const files: FileStamp[] = [];
    try {
        const children = folder.enumerate_children('standard::name,time::modified', Gio.FileQueryInfoFlags.NONE, null);
        for (let info = children.next_file(null); info; info = children.next_file(null)) {
            files.push({ name: info.get_name(), modified: info.get_attribute_uint64('time::modified') * 1000 });
        }
        children.close(null);
    } catch {
        return null;
    }
    // Seconds are enough: the file was written a moment ago.
    const name = newestScreenshot(files, Date.now());
    return name ? folder.get_child(name) : null;
}

function copy(file: Gio.File): void {
    file.load_contents_async(null, (_file, result) => {
        try {
            const [, bytes] = file.load_contents_finish(result);
            St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, 'image/png', new GLib.Bytes(bytes));
        } catch (error) {
            logError(error as Error, 'Macr: could not copy the screenshot');
        }
    });
}

function showInFiles(file: Gio.File): void {
    const app = Gio.AppInfo.get_default_for_type('inode/directory', false);
    if (!app) {
        log('Macr: no app to show folders with');
        return;
    }
    launch(() => app.launch([file], global.create_app_launch_context(0, -1)));
}

function launch(action: () => void): void {
    try {
        action();
    } catch (error) {
        logError(error as Error, 'Macr: could not open the screenshot');
    }
}
