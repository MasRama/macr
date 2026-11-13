import type Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { isLight } from '../../shared/scheme.js';
import { Focus } from './focus.js';
import { hiddenTiles, type TileId } from './logic/tiles.js';
import { NowPlayingTile } from './now-playing.js';
import { StageManagerToggle } from './stage-manager.js';

type Items = { quickSettingsItems: Clutter.Actor[] };
type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
type Slider = St.Bin & Items;
/** GNOME 46's quick settings button, once its indicators are set up. */
export type QuickSettingsButton = {
    menu: PopupMenu.PopupMenu & { _grid: Clutter.Actor; addItem(item: Clutter.Actor, colSpan?: number): void };
    addExternalIndicator(indicator: Clutter.Actor & Items): void;
    _system: Items;
    _volumeOutput: Items;
    _volumeInput: Items;
    _brightness: Items;
    _network: Items | null;
    _bluetooth: Items | null;
    _backgroundApps?: Items;
    _rfkill: Items;
    _nightLight: Items;
    _darkMode: Items;
    _powerProfiles: Items;
};

/** A tile a user hid, out of the grid until the Control Center is rebuilt. */
type Hidden = { item: Clutter.Actor; index: number; span: number };
type LayoutMeta = { column_span: number };

/** GNOME's own toggle indicators, whose items the slider cards follow. */
const TOGGLES = ['_camera', '_remoteAccess', '_thunderbolt', '_location', '_network', '_bluetooth', '_powerProfiles', '_nightLight', '_darkMode', '_backlight', '_rfkill', '_autoRotate', '_unsafeMode'];

/** The slider cards in macOS order, with their titles. */
const SLIDERS: ['_brightness' | '_volumeOutput' | '_volumeInput', string][] = [
    ['_brightness', 'Display'],
    ['_volumeOutput', 'Sound'],
    ['_volumeInput', 'Microphone'],
];

/** A slider's own box, wrapped with a title above it. */
type Titled = { item: St.Bin; box: Clutter.Actor; wrapper: St.BoxLayout };

/**
 * GNOME's quick settings as the macOS Control Center: toggles first, Focus
 * and Stage Manager toggles, a Now Playing tile, then titled slider cards,
 * and Macr's look (stylesheet, under `macr-cc`). Tiles the user hid in
 * Macr's settings (`control-center-hidden`) are taken out of the grid.
 * GNOME's own items and backends do the work; everything is put back on
 * destroy.
 */
export class ControlCenter {
    private readonly menu: QuickSettingsButton['menu'];
    private readonly grid: Clutter.Actor;
    private readonly blur = new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 });
    private readonly titled: Titled[] = [];
    private readonly focus: Focus;
    private readonly stageManager: StageManagerToggle;
    private readonly nowPlaying: NowPlayingTile;
    private readonly hidden: Hidden[] = [];
    private readonly openId: number;

    constructor(
        private readonly qs: QuickSettingsButton,
        settings: Gio.Settings,
        extensionPath: string,
    ) {
        this.menu = qs.menu;
        this.focus = new Focus(settings, extensionPath);
        this.stageManager = new StageManagerToggle(settings, extensionPath);
        this.grid = qs.menu._grid;

        this.menu.actor.add_style_class_name('macr-cc');
        this.menu.box.add_effect(this.blur);
        this.syncScheme();
        this.openId = (this.menu as unknown as Signals).connect('open-state-changed', (_menu: unknown, open: boolean) => {
            if (open) this.syncScheme();
        });

        qs.addExternalIndicator(this.focus.indicator);
        // Right after the connectivity toggles, like macOS.
        const after = qs._bluetooth?.quickSettingsItems.at(-1) ?? qs._network?.quickSettingsItems.at(-1) ?? qs._system.quickSettingsItems.at(-1);
        if (after) this.grid.set_child_above_sibling(this.focus.toggle, after);
        qs.addExternalIndicator(this.stageManager.indicator);
        this.grid.set_child_above_sibling(this.stageManager.toggle, this.focus.toggle);

        // Now Playing, full width, then the slider cards: after GNOME's own
        // toggles, before other extensions'.
        this.nowPlaying = new NowPlayingTile(() => this.menu.close(true));
        this.menu.addItem(this.nowPlaying.actor, 2);
        let previous = this.lastToggle();
        if (previous) this.grid.set_child_above_sibling(this.nowPlaying.actor, previous);
        previous = this.nowPlaying.actor;
        for (const [key, title] of SLIDERS) {
            for (const item of qs[key].quickSettingsItems) {
                if (previous) this.grid.set_child_above_sibling(item, previous);
                previous = item;
                this.addTitle(item as Slider, title);
            }
        }
        this.hide(hiddenTiles(settings.get_strv('control-center-hidden')));
    }

    destroy(): void {
        (this.menu as unknown as Signals).disconnect(this.openId);
        // Back where they were, before anything else moves.
        for (const { item, index, span } of this.hidden) {
            this.grid.insert_child_at_index(item, index);
            (this.grid.layout_manager.get_child_meta(this.grid, item) as unknown as LayoutMeta).column_span = span;
        }
        this.hidden.length = 0;
        // GNOME's order: the sliders right under the system row.
        let previous = this.qs._system.quickSettingsItems.at(-1);
        for (const key of ['_volumeOutput', '_volumeInput', '_brightness'] as const) {
            for (const item of this.qs[key].quickSettingsItems) {
                if (previous) this.grid.set_child_above_sibling(item, previous);
                previous = item;
            }
        }
        for (const { item, box, wrapper } of this.titled) {
            wrapper.remove_child(box);
            item.set_child(box);
            wrapper.destroy();
        }
        this.titled.length = 0;
        this.nowPlaying.destroy();
        this.stageManager.destroy();
        this.focus.destroy();
        this.menu.box.remove_effect(this.blur);
        this.menu.actor.remove_style_class_name('macr-cc');
        this.menu.actor.remove_style_class_name('macr-light');
    }

    /** The grid items of a tile. */
    private tileItems(tile: TileId): Clutter.Actor[] {
        const qs = this.qs;
        switch (tile) {
            case 'wifi':
                return qs._network?.quickSettingsItems ?? [];
            case 'bluetooth':
                return qs._bluetooth?.quickSettingsItems ?? [];
            case 'focus':
                return [this.focus.toggle];
            case 'stage-manager':
                return [this.stageManager.toggle];
            case 'now-playing':
                return [this.nowPlaying.actor];
            case 'airplane-mode':
                return qs._rfkill.quickSettingsItems;
            case 'night-light':
                return qs._nightLight.quickSettingsItems;
            case 'dark-style':
                return qs._darkMode.quickSettingsItems;
            case 'power-mode':
                return qs._powerProfiles.quickSettingsItems;
            case 'display':
                return qs._brightness.quickSettingsItems;
            case 'sound':
                return qs._volumeOutput.quickSettingsItems;
            case 'microphone':
                return qs._volumeInput.quickSettingsItems;
        }
    }

    /** Takes the hidden tiles out of the grid, last first, keeping where each was. */
    private hide(tiles: Set<TileId>): void {
        const items = [...tiles].flatMap((tile) => this.tileItems(tile)).filter((item) => item.get_parent() === this.grid);
        const children = this.grid.get_children();
        const placed = items.map((item) => ({ item, index: children.indexOf(item), span: (this.grid.layout_manager.get_child_meta(this.grid, item) as unknown as LayoutMeta).column_span })).sort((a, b) => a.index - b.index);
        for (const entry of [...placed].reverse()) this.grid.remove_child(entry.item);
        this.hidden.push(...placed);
    }

    /** GNOME's last own toggle in the grid. */
    private lastToggle(): Clutter.Actor | undefined {
        const children = this.grid.get_children();
        const toggles = new Set<Clutter.Actor>();
        for (const key of TOGGLES) {
            const indicator = (this.qs as unknown as Record<string, Items | null | undefined>)[key];
            for (const item of indicator?.quickSettingsItems ?? []) toggles.add(item);
        }
        return children.filter((child) => toggles.has(child)).at(-1);
    }

    private addTitle(item: St.Bin, title: string): void {
        const box = item.get_child();
        if (!box) return;
        item.set_child(null);
        const wrapper = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'macr-cc-slider-box' });
        wrapper.add_child(new St.Label({ text: title, style_class: 'macr-cc-slider-title' }));
        wrapper.add_child(box);
        item.set_child(wrapper);
        this.titled.push({ item, box, wrapper });
    }

    private syncScheme(): void {
        if (isLight()) this.menu.actor.add_style_class_name('macr-light');
        else this.menu.actor.remove_style_class_name('macr-light');
    }
}
