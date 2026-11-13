import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { FixedSpaces } from './fixed-spaces.js';
import { SpacesBar, type SpacesBox } from './spaces-bar.js';

type Signals = { connect(signal: string, callback: (...args: never[]) => void): number; disconnect(id: number): void };
/** GNOME 46's workspace thumbnails (the Spaces bar). */
type ThumbnailsBox = St.Widget & { _shouldShow: boolean; _maxThumbnailScale: number; _updateShouldShow(): void };
type Controls = { _thumbnailsBox: ThumbnailsBox; _searchEntryBin: St.Widget };
type BackgroundManager = { backgroundActor: Clutter.Actor; connect(signal: 'changed', callback: () => void): number; destroy(): void };
type BackgroundManagerClass = new (params: { container: Clutter.Actor; monitorIndex: number; controlPosition: boolean }) => BackgroundManager;

/** The Spaces bar's height, as a share of the monitor (GNOME's is 0.05). */
const THUMBNAIL_SCALE = 0.09;

/**
 * GNOME's overview as macOS Mission Control: the windows spread straight over
 * a dimmed, blurred copy of the wallpaper (no workspace card), the Spaces bar
 * always at the top with bigger thumbnails, + and × on it to add and close
 * Spaces, and no search box (typing still searches; Spotlight is the place
 * for it). The look is in the stylesheet
 * under `macr-mission-control`. Everything is put back on destroy.
 */
export class MissionControl {
    private readonly group = Main.layoutManager.overviewGroup as St.Widget;
    private readonly controls = (Main.overview as unknown as { _overview: { _controls: Controls } })._overview._controls;
    private readonly proto = Object.getPrototypeOf(this.controls._thumbnailsBox) as ThumbnailsBox;
    private readonly updateShouldShow = this.proto._updateShouldShow;
    private readonly ids: [Signals, number][] = [];
    private readonly hiddenCards = new Set<Clutter.Actor>();
    private backgrounds: { actor: St.Widget; manager: BackgroundManager }[] = [];
    private readonly bars = new Map<SpacesBox, SpacesBar>();
    private hideLater = 0;

    constructor(private readonly spaces: FixedSpaces) {
        this.group.add_style_class_name('macr-mission-control');

        // The Spaces bar shows even with a single desktop.
        this.proto._updateShouldShow = function (this: ThumbnailsBox) {
            if (this._shouldShow) return;
            this._shouldShow = true;
            this.notify('should-show');
        };
        for (const box of this.thumbnailBoxes()) {
            box._maxThumbnailScale = THUMBNAIL_SCALE;
            box._updateShouldShow();
        }

        const search = this.controls._searchEntryBin;
        search.opacity = 0;
        search.set_height(0);

        this.buildBackgrounds();
        this.connect(Main.layoutManager, 'monitors-changed', () => {
            this.buildBackgrounds();
            this.syncBars();
        });
        this.connect(Main.overview, 'showing', () => {
            this.hideCards();
            this.syncBars();
        });
        // A Space added while Mission Control is open comes with its own card.
        this.connect(global.workspace_manager, 'workspace-added', () => this.queueHideCards());
        this.hideCards();
        this.syncBars();
    }

    destroy(): void {
        for (const [object, id] of this.ids) object.disconnect(id);
        this.ids.length = 0;
        if (this.hideLater) global.compositor.get_laters().remove(this.hideLater);
        this.hideLater = 0;

        this.group.remove_style_class_name('macr-mission-control');
        this.proto._updateShouldShow = this.updateShouldShow;
        for (const box of this.thumbnailBoxes()) {
            box._maxThumbnailScale = 0.05;
            box._updateShouldShow();
        }

        const search = this.controls._searchEntryBin;
        search.opacity = 255;
        search.set_height(-1);

        this.clearBackgrounds();
        for (const bar of this.bars.values()) bar.destroy();
        this.bars.clear();
        for (const card of this.hiddenCards) card.opacity = 255;
        this.hiddenCards.clear();
    }

    private connect(object: object, signal: string, callback: (...args: never[]) => void): void {
        const target = object as Signals;
        this.ids.push([target, target.connect(signal, callback)]);
    }

    /** Every Spaces bar: the primary monitor's and any other monitor's. */
    private thumbnailBoxes(): ThumbnailsBox[] {
        return findAll(this.group, 'workspace-thumbnails') as ThumbnailsBox[];
    }

    /** A + and × for every Spaces bar; the other monitors' bars come anew when monitors change. */
    private syncBars(): void {
        const boxes = this.thumbnailBoxes() as unknown as SpacesBox[];
        for (const [box, bar] of this.bars) {
            if (boxes.includes(box)) continue;
            bar.destroy();
            this.bars.delete(box);
        }
        for (const box of boxes) {
            const bar = this.bars.get(box);
            if (bar) {
                bar.refresh();
                continue;
            }
            this.bars.set(box, new SpacesBar(box, this.spaces));
            this.connect(box, 'destroy', () => {
                this.bars.get(box)?.destroy();
                this.bars.delete(box);
            });
        }
    }

    /** GNOME makes the card after the signal: hide it before the next frame. */
    private queueHideCards(): void {
        if (this.hideLater) return;
        this.hideLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.hideLater = 0;
            this.hideCards();
            return false;
        });
    }

    /** GNOME draws each workspace as a wallpaper card; Mission Control has none. */
    private hideCards(): void {
        for (const card of findAll(this.group, 'workspace-background')) {
            if (this.hiddenCards.has(card)) continue;
            card.opacity = 0;
            this.hiddenCards.add(card);
            card.connect('destroy', () => this.hiddenCards.delete(card));
        }
        for (const box of this.thumbnailBoxes()) box._maxThumbnailScale = THUMBNAIL_SCALE;
    }

    /**
     * Each monitor's wallpaper, blurred and dimmed. The blur draws its
     * content offscreen once and keeps it, and mutter clips a wallpaper
     * whose actor sits at the stage origin to the area being redrawn, which
     * may be another monitor's: the picture came out empty there (the
     * monitor left of the primary one). A clone is always drawn whole, so
     * the blur gets a clone of the wallpaper, kept in a hidden holder.
     */
    private buildBackgrounds(): void {
        this.clearBackgrounds();
        const Manager = Background.BackgroundManager as unknown as BackgroundManagerClass;
        Main.layoutManager.monitors.forEach((monitor, monitorIndex) => {
            const { width, height } = monitor;
            const actor = new St.Widget({ x: monitor.x, y: monitor.y, width, height });
            const holder = new St.Widget({ visible: false, width, height });
            const manager = new Manager({ container: holder, monitorIndex, controlPosition: false });
            const picture = new Clutter.Clone({ source: manager.backgroundActor, width, height });
            // A new wallpaper comes as a new actor.
            manager.connect('changed', () => picture.set_source(manager.backgroundActor));
            actor.add_child(holder);
            actor.add_child(picture);
            actor.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.ACTOR, radius: 30, brightness: 0.75 }));
            actor.add_child(new St.Widget({ style_class: 'macr-mission-control-dim', width, height }));
            this.group.insert_child_at_index(actor, 0);
            this.backgrounds.push({ actor, manager });
        });
    }

    private clearBackgrounds(): void {
        for (const { actor, manager } of this.backgrounds) {
            manager.destroy();
            actor.destroy();
        }
        this.backgrounds = [];
    }
}

function findAll(root: Clutter.Actor, styleClass: string): St.Widget[] {
    const found: St.Widget[] = [];
    const walk = (actor: Clutter.Actor) => {
        if (actor instanceof St.Widget && actor.has_style_class_name(styleClass)) found.push(actor);
        for (const child of actor.get_children()) walk(child);
    };
    walk(root);
    return found;
}
