import type Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { pickPlayer } from './logic/now-playing.js';

/** The parts of the shell's MprisPlayer (ui/mpris.js) Now Playing uses. */
export interface Player {
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
 * Follows the shell's MPRIS players (the date menu's media section) and
 * tells `changed` which one Now Playing shows: one that is playing, else
 * the one used last, among those that can play; null for none.
 */
export class NowPlaying {
    private readonly section: MediaSection | null = mediaSection();
    private readonly sectionIds: number[] = [];
    private readonly watched = new Map<Player, { ids: number[]; changedAt: number }>();
    player: Player | null = null;

    constructor(private readonly changed: (player: Player | null) => void) {
        // A player gets a message in the section once it can play, and loses it when it goes.
        const list = this.section?._list;
        if (list) this.sectionIds.push(list.connect('child-added', () => this.watch()), list.connect('child-removed', () => this.watch()));
        this.watch();
    }

    destroy(): void {
        const list = this.section?._list;
        if (list) for (const id of this.sectionIds) list.disconnect(id);
        this.sectionIds.length = 0;
        for (const [player, { ids }] of this.watched) for (const id of ids) player.disconnect(id);
        this.watched.clear();
        this.player = null;
    }

    /** One signal set per player, dropped when it goes. */
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
        this.changed(this.player);
    }
}
