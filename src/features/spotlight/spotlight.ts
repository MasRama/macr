import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { clipboardHistory } from '../../shared/clipboard-link.js';
import { previewUri } from '../../shared/logic/quick-look.js';
import { quickLook } from '../../shared/quick-look.js';
import { isLight } from '../../shared/scheme.js';
import { answerProviders, type Provider, type ResultMeta } from './answers.js';
import { APPS_PROVIDER, type Layout, layoutResults, type ProviderResults, wrapIndex } from './logic/results.js';
import { dropRepeats, escapeStep, isSystemAction, repeatKey, type SpotlightView, viewForKey, viewProviders, VIEWS } from './logic/views.js';
import { Online } from './online.js';
import { macrViewProviders } from './views.js';

interface Hit {
    provider: Provider;
    meta: ResultMeta;
}

interface Row {
    button: St.Button;
    hit: Hit;
}

type Easeable = {
    ease(params: Record<string, unknown> & { duration: number; mode: Clutter.AnimationMode; onStopped?: () => void }): void;
};

const DEBOUNCE_MS = 120;
const OPEN_MS = 120;
const CLOSE_MS = 100;
/** Results asked of each provider: one more than shown, for the Top Hit; a view lists them all. */
const ASK = { apps: 7, other: 5, view: 200 };
/** The view buttons by the search field, as on Super+1..4. */
const VIEW_BUTTONS: Record<(typeof VIEWS)[number], { icon: string; name: () => string }> = {
    apps: { icon: 'view-app-grid-symbolic', name: () => _('Apps') },
    files: { icon: 'folder-documents-symbolic', name: () => _('Files') },
    actions: { icon: 'system-run-symbolic', name: () => _('Actions') },
    clipboard: { icon: 'edit-paste-symbolic', name: () => _('Clipboard') },
};

function hintText(view: SpotlightView): string {
    switch (view) {
        case 'apps':
            return _('Search Apps');
        case 'files':
            return _('Search Files');
        case 'actions':
            return _('Search Actions');
        default:
            return _('Spotlight Search');
    }
}

/** GNOME's search providers, the overview's own list. */
function gnomeProviders(): Provider[] {
    const view = (Main.overview.searchController as unknown as { _searchResults?: { _providers?: Provider[] } })._searchResults;
    return view?._providers ?? [];
}

function providerTitle(provider: Provider): string {
    if (provider.title) return provider.title;
    return provider.id === APPS_PROVIDER ? _('Applications') : (provider.appInfo?.get_name() ?? provider.id);
}

/**
 * macOS Spotlight: a search field in the middle of the monitor under the
 * pointer, with GNOME's search providers (apps, files, settings, calculator
 * and whatever else is installed) listed under it as results arrive, with
 * Macr's own answers around them: conversions first, then a definition and
 * the web. Super+1..4 (or the buttons by the field) narrow it to Apps,
 * Files, Actions or the Clipboard, as macOS Tahoe's Spotlight does.
 */
export class Spotlight {
    private readonly online = new Online();
    private readonly answers: { first: Provider[]; last: Provider[] };
    private readonly views = macrViewProviders();
    private view: SpotlightView = 'all';
    private viewButtons = new Map<SpotlightView, St.Button>();
    private root: St.Widget | null = null;
    private entry: St.Entry | null = null;
    private list: St.BoxLayout | null = null;
    private scroll: St.ScrollView | null = null;
    private grab: Clutter.Grab | null = null;
    private rows: Row[] = [];
    private selected = -1;
    private terms: string[] = [];
    private groups = new Map<string, ProviderResults<Hit>>();
    private cancellable: Gio.Cancellable | null = null;
    private debounceId = 0;
    private closing = false;
    /** Enter came before the results: open the first one when they arrive. */
    private activateWhenReady = false;
    /** The user picked a result (arrows or pointer): it stays selected as others arrive. */
    private picked = false;

    constructor(settings: Gio.Settings) {
        this.answers = answerProviders(settings, this.online);
    }

    get isOpen(): boolean {
        return this.root !== null && !this.closing;
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    open(): void {
        if (this.root) this.finishClose();
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;

        const root = new St.Widget({ reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        const panel = new St.BoxLayout({ vertical: true, style_class: 'macr-spotlight', width: 680 * scale });
        const top = Math.round(monitor.height * 0.22);
        panel.set_position(Math.round((monitor.width - 680 * scale) / 2), top);
        const backdrop = new St.Widget({ style_class: 'macr-spotlight-backdrop' });
        if (isLight()) {
            panel.add_style_class_name('macr-light');
            backdrop.add_style_class_name('macr-light');
        }
        backdrop.add_effect(new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 0.95 }));
        backdrop.add_constraint(new Clutter.BindConstraint({ source: panel, coordinate: Clutter.BindCoordinate.ALL }));
        root.add_child(backdrop);
        root.add_child(panel);

        const entry = new St.Entry({ style_class: 'macr-spotlight-entry', hint_text: _('Spotlight Search'), can_focus: true, x_expand: true });
        entry.set_primary_icon(new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'macr-spotlight-icon' }));
        const bar = new St.BoxLayout({ style_class: 'macr-spotlight-bar' });
        bar.add_child(entry);
        bar.add_child(this.viewBar());
        panel.add_child(bar);
        // Long result lists scroll instead of running off the monitor.
        const scroll = new St.ScrollView({
            style_class: 'macr-spotlight-results',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            visible: false,
            style: `max-height: ${Math.round((monitor.height - top) / scale - 140)}px;`,
        });
        const list = new St.BoxLayout({ vertical: true });
        scroll.set_child(list);
        panel.add_child(scroll);

        this.root = root;
        this.entry = entry;
        this.list = list;
        this.scroll = scroll;
        this.closing = false;
        this.view = 'all';

        root.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
            const target = (global.stage as Clutter.Stage).get_event_actor(event);
            if (target && panel.contains(target)) return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
        entry.clutter_text.connect('key-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => this.onKey(event));
        entry.clutter_text.connect('text-changed', () => this.queueSearch());

        Main.layoutManager.uiGroup.add_child(root);
        const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.POPUP }) as Clutter.Grab;
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this.finishClose();
            return;
        }
        this.grab = grab;
        (global.stage as Clutter.Stage).set_key_focus(entry.clutter_text);

        panel.set_pivot_point(0.5, 0);
        panel.opacity = 0;
        panel.set_scale(0.97, 0.97);
        backdrop.opacity = 0;
        for (const actor of [panel, backdrop]) {
            (actor as unknown as Easeable).ease({ opacity: 255, scale_x: 1, scale_y: 1, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        }
    }

    close(): void {
        const root = this.root;
        if (!root || this.closing) return;
        this.closing = true;
        this.stopSearch();
        this.releaseGrab();
        (root as unknown as Easeable).ease({
            opacity: 0,
            duration: CLOSE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (this.root === root) this.finishClose();
            },
        });
    }

    destroy(): void {
        this.finishClose();
        this.online.destroy();
    }

    private releaseGrab(): void {
        if (this.grab) Main.popModal(this.grab);
        this.grab = null;
    }

    private finishClose(): void {
        this.stopSearch();
        this.releaseGrab();
        this.root?.destroy();
        this.root = null;
        this.entry = null;
        this.list = null;
        this.scroll = null;
        this.viewButtons.clear();
        this.rows = [];
        this.selected = -1;
        this.groups.clear();
        this.closing = false;
        this.activateWhenReady = false;
    }

    private stopSearch(): void {
        if (this.debounceId) GLib.source_remove(this.debounceId);
        this.debounceId = 0;
        this.cancellable?.cancel();
        this.cancellable = null;
    }

    private queueSearch(): void {
        if (this.debounceId) GLib.source_remove(this.debounceId);
        this.debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this.debounceId = 0;
            this.search();
            return GLib.SOURCE_REMOVE;
        });
    }

    private search(): void {
        this.cancellable?.cancel();
        const terms = (this.entry?.get_text() ?? '').trim().split(/\s+/).filter(Boolean);
        this.terms = terms;
        this.groups.clear();
        this.picked = false;
        const gnome = gnomeProviders();
        const known = new Map<string, Provider>([...this.answers.first, ...gnome, ...this.answers.last, ...this.views.values()].map((provider) => [provider.id, provider]));
        const all = viewProviders(
            this.view,
            !terms.length,
            gnome.map((provider) => provider.id),
        ).flatMap((id) => known.get(id) ?? []);
        if (!all.length) {
            this.cancellable = null;
            this.render();
            return;
        }
        const cancellable = new Gio.Cancellable();
        this.cancellable = cancellable;
        // Every provider has a slot from the start, so sections keep their order.
        for (const provider of all) this.groups.set(provider.id, { id: provider.id, title: providerTitle(provider), results: [] });
        let remaining = all.length;
        for (const provider of all) {
            this.ask(provider, terms, cancellable)
                .then((hits) => {
                    if (cancellable.is_cancelled() || this.cancellable !== cancellable) return;
                    this.groups.set(provider.id, { id: provider.id, title: providerTitle(provider), results: hits });
                    this.render();
                })
                .catch((error: unknown) => {
                    if (!cancellable.is_cancelled()) console.warn(`Macr: search provider ${provider.id} failed: ${error}`);
                })
                .finally(() => {
                    remaining--;
                    if (cancellable.is_cancelled() || this.cancellable !== cancellable || !this.activateWhenReady) return;
                    // Apps are the likely target; otherwise wait for everyone.
                    const appsIn = provider.id === APPS_PROVIDER && (this.groups.get(APPS_PROVIDER)?.results.length ?? 0) > 0;
                    if (appsIn || remaining === 0) {
                        this.activateWhenReady = false;
                        this.activate(this.selected);
                    }
                });
        }
    }

    private async ask(provider: Provider, terms: string[], cancellable: Gio.Cancellable): Promise<Hit[]> {
        let ids = await provider.getInitialResultSet(terms, cancellable);
        // The Apps view lists apps only, not the system actions GNOME puts with them.
        if (this.view === 'apps' && provider.id === APPS_PROVIDER) ids = ids.filter((id) => !isSystemAction(id));
        const ask = this.view !== 'all' ? ASK.view : provider.id === APPS_PROVIDER ? ASK.apps : ASK.other;
        const wanted = provider.filterResults(ids, ask);
        if (!wanted.length) return [];
        const metas = await provider.getResultMetas(wanted, cancellable);
        return metas.map((meta) => ({ provider, meta }));
    }

    private render(): void {
        const list = this.list;
        if (!list) return;
        const previous = this.picked ? this.rows[this.selected]?.hit : undefined;
        list.destroy_all_children();
        this.rows = [];
        // A file in Recent Files and the Files provider, or Lock Screen in
        // GNOME's apps and Macr's Actions, shows once.
        const groups = dropRepeats([...this.groups.values()], (hit: Hit) => repeatKey(hit.provider.id, hit.meta.id));
        const layout: Layout<Hit> = layoutResults(groups, { topHit: this.view === 'all', capped: this.view === 'all' });
        if (layout.topHit) {
            list.add_child(this.header(_('Top Hit')));
            this.addRow(list, layout.topHit.item, true);
        }
        for (const section of layout.sections) {
            list.add_child(this.header(section.title));
            for (const hit of section.items) this.addRow(list, hit, false);
        }
        if (this.scroll) this.scroll.visible = this.rows.length > 0;
        // Keep the result the user picked while slower providers fill in;
        // otherwise the Top Hit, which can change as they do.
        const kept = previous ? this.rows.findIndex((row) => row.hit.provider === previous.provider && row.hit.meta.id === previous.meta.id) : -1;
        this.select(kept >= 0 ? kept : this.rows.length ? 0 : -1);
    }

    private header(text: string): St.Label {
        return new St.Label({ text, style_class: 'macr-spotlight-header' });
    }

    private addRow(list: St.BoxLayout, hit: Hit, top: boolean): void {
        const box = new St.BoxLayout({ style_class: 'macr-spotlight-row-box', x_expand: true, x_align: Clutter.ActorAlign.START });
        const icon = hit.meta.createIcon?.(top ? 40 : 24) ?? new St.Icon({ icon_name: 'system-search-symbolic', icon_size: top ? 40 : 24 });
        icon.y_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        const text = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, x_expand: true, style_class: 'macr-spotlight-text' });
        const name = new St.Label({ text: hit.meta.name, style_class: 'macr-spotlight-name' });
        name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        text.add_child(name);
        const description = hit.meta.description?.split('\n')[0];
        if (description) {
            const label = new St.Label({ text: description, style_class: 'macr-spotlight-description' });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(label);
        }
        box.add_child(text);
        const button = new St.Button({ style_class: top ? 'macr-spotlight-row macr-spotlight-top' : 'macr-spotlight-row', child: box, can_focus: false, x_expand: true });
        const index = this.rows.length;
        button.connect('clicked', () => this.activate(index));
        button.connect('notify::hover', () => {
            if (!button.hover) return;
            this.picked = true;
            this.select(index);
        });
        list.add_child(button);
        this.rows.push({ button, hit });
    }

    private select(index: number, reveal = false): void {
        this.selected = index;
        this.rows.forEach((row, at) => {
            if (at === index) row.button.add_style_pseudo_class('selected');
            else row.button.remove_style_pseudo_class('selected');
        });
        const row = this.rows[index];
        if (reveal && row && this.scroll) ensureActorVisibleInScrollView(this.scroll, row.button);
    }

    private activate(index: number): void {
        const row = this.rows[index];
        if (!row) return;
        const terms = this.terms;
        this.close();
        row.hit.provider.activateResult(row.hit.meta.id, terms);
    }

    /**
     * Quick Look on the selected result when it is a file; the arrow keys in
     * the previewer go through the other files listed. Spotlight closes
     * first: the previewer is a window, under Spotlight while it stays.
     */
    private lookAtSelected(): void {
        const files = this.rows.map((row, at) => ({ at, uri: previewUri(row.hit.meta.id) })).filter((file): file is { at: number; uri: string } => file.uri !== null);
        const index = files.findIndex((file) => file.at === this.selected);
        if (index < 0) return;
        this.close();
        quickLook(
            files.map((file) => file.uri),
            index,
        );
    }

    private onKey(event: Clutter.Event): boolean {
        const command = (event.get_state() & (Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.CONTROL_MASK)) !== 0;
        switch (event.get_key_symbol()) {
            // Cmd+Y on a Mac.
            case Clutter.KEY_y:
            case Clutter.KEY_Y:
                if (!command) return Clutter.EVENT_PROPAGATE;
                this.lookAtSelected();
                return Clutter.EVENT_STOP;
            // Cmd+1..4 on a Mac.
            case Clutter.KEY_1:
            case Clutter.KEY_2:
            case Clutter.KEY_3:
            case Clutter.KEY_4: {
                if (!command) return Clutter.EVENT_PROPAGATE;
                const view = viewForKey(event.get_key_symbol() - Clutter.KEY_0, this.view);
                if (view) this.setView(view);
                return Clutter.EVENT_STOP;
            }
            case Clutter.KEY_Escape:
                switch (escapeStep(this.entry?.get_text() ?? '', this.view)) {
                    case 'clear':
                        this.entry?.set_text('');
                        break;
                    case 'leave':
                        this.setView('all');
                        break;
                    case 'close':
                        this.close();
                        break;
                }
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                // Typed fast: search now and open the first result once it is in.
                if (this.debounceId) {
                    this.stopSearchTimer();
                    this.activateWhenReady = true;
                    this.search();
                } else {
                    this.activate(this.selected);
                }
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Down:
                this.picked = true;
                this.select(wrapIndex(this.selected, 1, this.rows.length), true);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Up:
                this.picked = true;
                this.select(wrapIndex(this.selected, -1, this.rows.length), true);
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }

    /** The round view buttons right of the field; Clipboard only while its history runs. */
    private viewBar(): St.BoxLayout {
        const box = new St.BoxLayout({ style_class: 'macr-spotlight-views', y_align: Clutter.ActorAlign.CENTER });
        VIEWS.forEach((view, at) => {
            if (view === 'clipboard' && !clipboardHistory()) return;
            const button = new St.Button({
                style_class: 'macr-spotlight-view',
                child: new St.Icon({ icon_name: VIEW_BUTTONS[view].icon, icon_size: 16 }),
                can_focus: false,
                accessible_name: VIEW_BUTTONS[view].name(),
            });
            button.connect('clicked', () => {
                const next = viewForKey(at + 1, this.view);
                if (next) this.setView(next);
            });
            box.add_child(button);
            this.viewButtons.set(view, button);
        });
        return box;
    }

    /**
     * Shows only `view`'s results, searching again at once. The Clipboard
     * view is the clipboard history's own panel: Spotlight hands it the text.
     */
    private setView(view: SpotlightView): void {
        if (view === 'clipboard') {
            const link = clipboardHistory();
            if (!link) return;
            const text = this.entry?.get_text() ?? '';
            this.finishClose();
            link.open(text);
            return;
        }
        this.view = view;
        for (const [at, button] of this.viewButtons) {
            if (at === view) button.add_style_pseudo_class('checked');
            else button.remove_style_pseudo_class('checked');
        }
        if (this.entry) this.entry.hint_text = hintText(view);
        this.stopSearchTimer();
        this.search();
    }

    private stopSearchTimer(): void {
        if (this.debounceId) GLib.source_remove(this.debounceId);
        this.debounceId = 0;
    }
}
