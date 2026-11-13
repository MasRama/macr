import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { canGiveBack, sameList, withoutClashes } from './logic/keys.js';

/**
 * Takes Macr's accelerators out of some of GNOME's keybinding lists while a
 * module runs (only those accelerators: the rest of each list keeps
 * working), and puts the user's lists back afterwards unless they changed
 * them since. The lists are saved in an `a{sas}` key of Macr's settings, so
 * a session that ended without `giveBack()` still knows the originals.
 */
export class BorrowedKeys {
    private readonly gnome: Gio.Settings;
    /** Macr's accelerators when the GNOME keys were changed. */
    private ours: string[] = [];

    constructor(
        private readonly macr: Gio.Settings,
        private readonly savedKey: string,
        schemaId: string,
        private readonly keys: readonly string[],
    ) {
        this.gnome = new Gio.Settings({ schema_id: schemaId });
    }

    /** Takes `ours` out of the GNOME keys. A list saved before is the one kept. */
    take(ours: readonly string[]): void {
        this.ours = [...ours];
        const saved = this.saved();
        for (const key of this.keys) {
            const original = saved[key] ?? this.gnome.get_strv(key);
            const wanted = withoutClashes(original, this.ours);
            if (sameList(wanted, original)) {
                delete saved[key];
                continue;
            }
            saved[key] = original;
            if (!sameList(this.gnome.get_strv(key), wanted)) this.gnome.set_strv(key, wanted);
        }
        this.save(saved);
    }

    giveBack(): void {
        for (const [key, original] of Object.entries(this.saved())) {
            if (!this.keys.includes(key)) continue;
            // Only if it is still what Macr made it.
            if (canGiveBack(this.gnome.get_strv(key), original, this.ours)) this.gnome.set_strv(key, original);
        }
        this.save({});
    }

    private saved(): Record<string, string[]> {
        return this.macr.get_value(this.savedKey).deepUnpack() as Record<string, string[]>;
    }

    private save(saved: Record<string, string[]>): void {
        this.macr.set_value(this.savedKey, new GLib.Variant('a{sas}', saved));
    }
}
