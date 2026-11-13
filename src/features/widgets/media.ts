import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { NowPlaying, type Player } from '../../shared/now-playing.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/**
 * The macOS Now Playing widget: the song an MPRIS player is playing, its
 * cover and a play button; medium adds the app's name and skip buttons.
 * The players are the shell's own, from the date menu's media section.
 */
export class MediaWidget extends DesktopWidget {
    private readonly players: NowPlaying;
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
        this.players = new NowPlaying((player) => this.sync(player));
    }

    override destroy(): void {
        this.players.destroy();
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

    private sync(player: Player | null): void {
        this.player = player;
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
