import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { pickPlayer } from './logic/media.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** The parts of the shell's MprisPlayer (ui/mpris.js) the widget uses. */
interface Player {
    readonly status: string;
    readonly trackTitle: string;
    readonly trackArtists: string[];
    readonly trackCoverUrl: string;
    readonly canGoNext: boolean;
    readonly canGoPrevious: boolean;
    readonly app: { get_name(): string } | null;
    playPause(): void;
    next(): void;
    previous(): void;
    raise(): void;
    connect(signal: 'changed' | 'closed', callback: () => void): number;
    disconnect(id: number): void;
}

/** The date menu's media section: it keeps one MprisPlayer per app on the bus, and a message per playable one. */
interface MediaSection {
    _players: Map<string, Player>;
    _messages: { _player?: Player }[];
    _list: Clutter.Actor;
}

function mediaSection(): MediaSection | null {
    const dateMenu = Main.panel.statusArea.dateMenu as unknown as { _messageList?: { _mediaSection?: MediaSection } } | undefined;
    return dateMenu?._messageList?._mediaSection ?? null;
}

/** Counts changes across players: the last one changed is the one used last. */
let changes = 0;

/**
 * The macOS Now Playing widget: the song an MPRIS player is playing, its
 * cover and a play button; medium adds the app's name and skip buttons.
 * The players are the shell's own, from the date menu's media section.
 */
export class MediaWidget extends DesktopWidget {
    private readonly section: MediaSection | null = mediaSection();
    private readonly sectionIds: number[] = [];
    private readonly watched = new Map<Player, { ids: number[]; changedAt: number }>();
    private player: Player | null = null;
    private readonly art: St.Widget;
    private readonly placeholder: St.Icon;
    private readonly appName: St.Label | null = null;
    private readonly title: St.Label;
    private readonly artist: St.Label;
    private readonly play: St.Button;
    private readonly skips: St.Button[] = [];

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        const scale = host.scale;
        const side = Math.round((size === 'medium' ? box.height - 28 * scale : 68 * scale));
        this.art = new St.Widget({ style_class: 'macr-widget-media-art', width: side, height: side, layout_manager: new Clutter.BinLayout() });
        this.placeholder = new St.Icon({ icon_name: 'audio-x-generic-symbolic', style_class: 'macr-widget-media-placeholder', x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        this.art.add_child(this.placeholder);
        this.title = new St.Label({ style_class: 'macr-widget-media-title' });
        this.artist = new St.Label({ style_class: 'macr-widget-media-artist' });
        for (const label of [this.title, this.artist]) label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.play = this.button('media-playback-start-symbolic', () => this.player?.playPause());

        const content = new St.BoxLayout({ style_class: 'macr-widget-media-box', x_expand: true, y_expand: true, vertical: size === 'small' });
        if (size === 'small') {
            const top = new St.BoxLayout({ x_expand: true });
            top.add_child(this.art);
            top.add_child(new St.Widget({ x_expand: true }));
            this.play.y_align = Clutter.ActorAlign.START;
            top.add_child(this.play);
            content.add_child(top);
            content.add_child(new St.Widget({ y_expand: true }));
            content.add_child(this.title);
            content.add_child(this.artist);
        } else {
            content.add_child(this.art);
            const side = new St.BoxLayout({ style_class: 'macr-widget-media-side', vertical: true, x_expand: true });
            this.appName = new St.Label({ style_class: 'macr-widget-media-app' });
            side.add_child(this.appName);
            side.add_child(this.title);
            side.add_child(this.artist);
            side.add_child(new St.Widget({ y_expand: true }));
            const controls = new St.BoxLayout({ style_class: 'macr-widget-media-controls', x_align: Clutter.ActorAlign.START });
            const back = this.button('media-skip-backward-symbolic', () => this.player?.previous());
            const forward = this.button('media-skip-forward-symbolic', () => this.player?.next());
            this.skips.push(back, forward);
            controls.add_child(back);
            controls.add_child(this.play);
            controls.add_child(forward);
            side.add_child(controls);
            content.add_child(side);
        }
        this.actor.add_child(content);

        // A player gets a message in the section once it can play, and loses it when it goes.
        const list = this.section?._list;
        if (list) this.sectionIds.push(list.connect('child-added', () => this.watch()), list.connect('child-removed', () => this.watch()));
        this.watch();
    }

    override destroy(): void {
        const list = this.section?._list;
        if (list) for (const id of this.sectionIds) list.disconnect(id);
        this.sectionIds.length = 0;
        for (const [player, { ids }] of this.watched) for (const id of ids) player.disconnect(id);
        this.watched.clear();
        this.player = null;
        super.destroy();
    }

    protected activate(): void {
        if (this.player) this.player.raise();
        else this.openApp('org.gnome.Music.desktop');
    }

    private button(icon: string, clicked: () => void): St.Button {
        const button = new St.Button({ style_class: 'macr-widget-media-button', can_focus: false, child: new St.Icon({ icon_name: icon }) });
        button.connect('clicked', clicked);
        return button;
    }

    /** Follows the section's players: one signal set each, dropped when they go. */
    private watch(): void {
        const players = [...(this.section?._players.values() ?? [])];
        for (const [player, { ids }] of this.watched) {
            if (players.includes(player)) continue;
            for (const id of ids) player.disconnect(id);
            this.watched.delete(player);
        }
        for (const player of players) {
            if (this.watched.has(player)) continue;
            const state = { ids: [] as number[], changedAt: ++changes };
            state.ids.push(
                player.connect('changed', () => {
                    state.changedAt = ++changes;
                    this.sync();
                }),
                player.connect('closed', () => this.watch()),
            );
            this.watched.set(player, state);
        }
        this.sync();
    }

    private sync(): void {
        // Only players the shell shows: those that can play.
        const shown = new Set(this.section?._messages.map((message) => message._player) ?? []);
        const candidates = [...this.watched].filter(([player]) => shown.has(player)).map(([player, { changedAt }]) => ({ player, status: player.status, changedAt }));
        this.player = pickPlayer(candidates)?.player ?? null;
        const player = this.player;
        const cover = player?.trackCoverUrl ?? '';
        this.art.set_style(cover ? `background-image: url("${cover}"); background-size: cover;` : null);
        this.placeholder.visible = !cover;
        this.title.text = player ? player.trackTitle : _('Not Playing');
        this.artist.text = player ? player.trackArtists.join(', ') : '';
        if (this.appName) this.appName.text = player?.app?.get_name() ?? '';
        const playing = player?.status === 'Playing';
        (this.play.child as St.Icon).icon_name = playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this.play.visible = player !== null;
        const [back, forward] = this.skips;
        if (back) back.reactive = Boolean(player?.canGoPrevious);
        if (forward) forward.reactive = Boolean(player?.canGoNext);
        for (const skip of this.skips) {
            skip.visible = player !== null;
            skip.opacity = skip.reactive ? 255 : 110;
        }
    }
}
