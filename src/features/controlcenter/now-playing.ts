import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { NowPlaying, type Player } from '../../shared/now-playing.js';

/**
 * macOS Control Center's Now Playing: a wide tile with the song's cover,
 * title and artist, and back / play-pause / forward, for the player playing
 * or used last. Hidden while no player can play.
 */
export class NowPlayingTile {
    readonly actor: St.BoxLayout;
    private readonly players: NowPlaying;
    private readonly art: St.Widget;
    private readonly placeholder: St.Icon;
    private readonly title: St.Label;
    private readonly artist: St.Label;
    private readonly play: St.Button;
    private readonly back: St.Button;
    private readonly forward: St.Button;
    private player: Player | null = null;

    /** `opened` runs when a click raises the player's window, to close the Control Center. */
    constructor(opened: () => void) {
        this.actor = new St.BoxLayout({ style_class: 'macr-cc-now-playing', x_expand: true });
        const raise = new St.Button({ style_class: 'macr-cc-now-playing-info', x_expand: true, can_focus: true });
        const info = new St.BoxLayout({ x_expand: true });
        this.art = new St.Widget({ style_class: 'macr-cc-now-playing-art', layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER });
        this.placeholder = new St.Icon({ icon_name: 'audio-x-generic-symbolic', style_class: 'macr-cc-now-playing-placeholder', x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER });
        this.art.add_child(this.placeholder);
        info.add_child(this.art);
        const text = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'macr-cc-now-playing-text' });
        this.title = new St.Label({ style_class: 'macr-cc-now-playing-title' });
        this.artist = new St.Label({ style_class: 'macr-cc-now-playing-artist' });
        for (const label of [this.title, this.artist]) {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(label);
        }
        info.add_child(text);
        raise.set_child(info);
        raise.connect('clicked', () => {
            this.player?.raise();
            opened();
        });
        this.actor.add_child(raise);
        this.back = this.button('media-skip-backward-symbolic', () => this.player?.previous());
        this.play = this.button('media-playback-start-symbolic', () => this.player?.playPause());
        this.forward = this.button('media-skip-forward-symbolic', () => this.player?.next());
        this.players = new NowPlaying((player) => this.sync(player));
    }

    destroy(): void {
        this.players.destroy();
        this.player = null;
        this.actor.destroy();
    }

    private button(icon: string, clicked: () => void): St.Button {
        const button = new St.Button({ style_class: 'macr-cc-now-playing-button', can_focus: true, y_align: Clutter.ActorAlign.CENTER, child: new St.Icon({ icon_name: icon }) });
        button.connect('clicked', clicked);
        this.actor.add_child(button);
        return button;
    }

    private sync(player: Player | null): void {
        this.player = player;
        this.actor.visible = player !== null;
        if (!player) return;
        const cover = player.trackCoverUrl;
        this.art.set_style(cover ? `background-image: url("${cover}"); background-size: cover;` : null);
        this.placeholder.visible = !cover;
        this.title.text = player.trackTitle || (player.app?.get_name() ?? '');
        this.artist.text = player.trackArtists.join(', ');
        this.artist.visible = this.artist.text !== '';
        (this.play.child as St.Icon).icon_name = player.status === 'Playing' ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        for (const [button, can] of [
            [this.back, player.canGoPrevious],
            [this.forward, player.canGoNext],
        ] as const) {
            button.reactive = can;
            button.opacity = can ? 255 : 110;
        }
    }
}
