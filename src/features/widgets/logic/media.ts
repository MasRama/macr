/** What the Now Playing widget knows of an MPRIS player. */
export interface PlayerState {
    /** MPRIS PlaybackStatus: Playing, Paused or Stopped. */
    status: string;
    /** When it last changed, in any increasing unit. */
    changedAt: number;
}

/** The player the widget shows: one that is playing, else the one used last. */
export function pickPlayer<T extends PlayerState>(players: readonly T[]): T | null {
    let best: T | null = null;
    for (const player of players) {
        if (!best) best = player;
        else {
            const playing = Number(player.status === 'Playing') - Number(best.status === 'Playing');
            if (playing > 0 || (playing === 0 && player.changedAt > best.changedAt)) best = player;
        }
    }
    return best;
}
