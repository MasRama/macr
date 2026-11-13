import type Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { AccentModule } from './features/accent/index.js';
import { AppIconsModule } from './features/appicons/index.js';
import { AutoAppearanceModule } from './features/appearance/index.js';
import { AppExposeModule } from './features/expose/index.js';
import { ControlCenterModule } from './features/controlcenter/index.js';
import { WindowCornersModule } from './features/corners/index.js';
import { ShakeToFindModule } from './features/cursor/index.js';
import { DynamicDesktopModule } from './features/desktop/index.js';
import { DockModule } from './features/dock/index.js';
import { resetClipboardHistory } from './features/clipboard/history.js';
import { ClipboardModule } from './features/clipboard/index.js';
import { EmojiModule } from './features/emoji/index.js';
import { WallpaperClickModule } from './features/wallpaper/index.js';
import { DesktopWidgetsModule } from './features/widgets/index.js';
import { NotificationCenterWidgetsModule } from './features/widgets/notification-center.js';
import { GesturesModule } from './features/gestures/index.js';
import { HotCornersModule } from './features/hotcorners/index.js';
import { KeyboardModule } from './features/keyboard/index.js';
import { LaunchpadModule } from './features/launchpad/index.js';
import { LockScreenModule } from './features/lockscreen/index.js';
import { LoginScreenModule } from './features/loginscreen/index.js';
import { MenuBar } from './features/menubar/index.js';
import { MissionControlModule } from './features/missioncontrol/index.js';
import { NotificationsModule } from './features/notifications/index.js';
import { OsdModule } from './features/osd/index.js';
import { ScreenshotModule } from './features/screenshot/index.js';
import { FullscreenSpacesModule } from './features/spaces/index.js';
import { SoundsModule } from './features/sounds/index.js';
import { SpaceWallpapersModule } from './features/spacewallpapers/index.js';
import { SpotlightModule } from './features/spotlight/index.js';
import { StageManagerModule } from './features/stagemanager/index.js';
import { SwitcherModule } from './features/switcher/index.js';
import { TilingModule } from './features/tiling/index.js';
import { TrafficLightsModule } from './features/trafficlights/index.js';
import { ClashNotice } from './shared/clash-notice.js';
import { runsOn, screenOf } from './shared/logic/screen.js';
import type { Module, ModuleEntry } from './shared/module.js';
import { resetHider } from './shared/hider.js';
import { resetQuickLook } from './shared/quick-look.js';
import { resetTiling } from './shared/tiling-link.js';

const MODULES: ModuleEntry[] = [
    { key: 'menubar-enabled', create: (context) => new MenuBar(context) },
    { key: 'dock-enabled', create: (context) => new DockModule(context) },
    { key: 'launchpad-enabled', create: (context) => new LaunchpadModule(context) },
    { key: 'spotlight-enabled', create: (context) => new SpotlightModule(context) },
    { key: 'control-center-enabled', create: (context) => new ControlCenterModule(context) },
    { key: 'app-icon-tiles', create: () => new AppIconsModule() },
    { key: 'accent-enabled', create: (context) => new AccentModule(context.settings) },
    { key: 'osd-enabled', create: () => new OsdModule() },
    { key: 'switcher-enabled', create: () => new SwitcherModule() },
    { key: 'notifications-enabled', create: () => new NotificationsModule() },
    { key: 'mission-control-enabled', screens: ['desktop', 'lock'], create: (context) => new MissionControlModule(context.settings) },
    { key: 'hot-corners-enabled', create: (context) => new HotCornersModule(context.settings) },
    { key: 'gestures-enabled', create: () => new GesturesModule() },
    { key: 'shake-to-find-enabled', create: () => new ShakeToFindModule() },
    { key: 'sounds-enabled', screens: ['desktop', 'lock'], create: (context) => new SoundsModule(context) },
    { key: 'wallpaper-click-enabled', create: () => new WallpaperClickModule() },
    // Kept on while locked, so locking does not swap the wallpaper.
    { key: 'space-wallpapers-enabled', screens: ['desktop', 'lock'], create: (context) => new SpaceWallpapersModule(context.settings) },
    { key: 'window-corners-enabled', create: (context) => new WindowCornersModule(context.settings) },
    { key: 'traffic-lights-enabled', create: (context) => new TrafficLightsModule(context.settings) },
    { key: 'tiling-enabled', create: (context) => new TilingModule(context.settings) },
    { key: 'screenshot-enabled', create: (context) => new ScreenshotModule(context) },
    { key: 'keyboard-enabled', create: (context) => new KeyboardModule(context.settings) },
    { key: 'emoji-picker-enabled', create: (context) => new EmojiModule(context) },
    { key: 'clipboard-history-enabled', create: (context) => new ClipboardModule(context) },
    { key: 'app-expose-enabled', create: (context) => new AppExposeModule(context.settings) },
    { key: 'desktop-widgets-enabled', create: (context) => new DesktopWidgetsModule(context.settings) },
    { key: 'notification-center-widgets-enabled', create: (context) => new NotificationCenterWidgetsModule(context) },
    // Day and night come round while the screen is locked too.
    { key: 'appearance-auto', screens: ['desktop', 'lock'], create: (context) => new AutoAppearanceModule(context.settings) },
    // The lock screen's picture follows the time of day too.
    { key: 'dynamic-desktop-enabled', screens: ['desktop', 'lock'], create: () => new DynamicDesktopModule() },
    // Kept on while locked: turning off would move full-screen windows back.
    { key: 'fullscreen-spaces-enabled', screens: ['desktop', 'lock'], create: () => new FullscreenSpacesModule() },
    // Paused, not turned off, while locked: turning off would bring every window back.
    { key: 'stage-manager-enabled', screens: ['desktop', 'lock'], create: () => new StageManagerModule() },
    { key: 'lock-screen-enabled', screens: ['desktop', 'lock'], create: () => new LockScreenModule() },
    { key: 'login-screen-enabled', screens: ['login'], create: () => new LoginScreenModule() },
];

/**
 * Macr also runs on the lock screen ("unlock-dialog" session mode) and, when
 * installed for GDM, on the login screen ("gdm" mode). There only the
 * modules that name that screen run: every other module is turned off while
 * the screen is locked, as GNOME would turn off the whole extension, and back
 * on when it is unlocked.
 */
export default class Macr extends Extension {
    private settings: Gio.Settings | null = null;
    private running = new Map<string, Module>();
    private changedIds: number[] = [];
    private sessionId = 0;
    private clashNotice: ClashNotice | null = null;

    override enable(): void {
        const settings = this.getSettings();
        this.settings = settings;
        for (const entry of MODULES)
            this.changedIds.push(settings.connect(`changed::${entry.key}`, () => this.sync(entry)));
        this.sessionId = Main.sessionMode.connect('updated', () => this.syncAll());
        this.syncAll();
        this.clashNotice = new ClashNotice(settings, () => this.openPreferences());
    }

    override disable(): void {
        this.clashNotice?.destroy();
        this.clashNotice = null;
        Main.sessionMode.disconnect(this.sessionId);
        this.sessionId = 0;
        for (const id of this.changedIds) this.settings?.disconnect(id);
        this.changedIds = [];
        for (const module of [...this.running.values()].reverse()) module.disable();
        this.running.clear();
        resetTiling();
        resetHider();
        resetQuickLook();
        resetClipboardHistory();
        this.settings = null;
    }

    /** Modules stop in reverse order, then start in order. */
    private syncAll(): void {
        for (const entry of [...MODULES].reverse()) if (!this.wanted(entry)) this.sync(entry);
        for (const entry of MODULES) if (this.wanted(entry)) this.sync(entry);
    }

    private wanted(entry: ModuleEntry): boolean {
        return Boolean(this.settings?.get_boolean(entry.key)) && runsOn(entry.screens, screenOf(Main.sessionMode));
    }

    private sync(entry: ModuleEntry): void {
        const settings = this.settings;
        if (!settings) return;
        const wanted = this.wanted(entry);
        const module = this.running.get(entry.key);
        if (wanted && !module) {
            const created = entry.create({ settings, path: this.path });
            created.enable();
            this.running.set(entry.key, created);
        } else if (!wanted && module) {
            module.disable();
            this.running.delete(entry.key);
        }
    }
}
