// The emoji picker's categories, search and Frequently Used list.

export interface Emoji {
    char: string;
    name: string;
    category: Category;
}

/** macOS's categories, in its order. Frequently Used comes from the picks. */
export type Category = 'recent' | 'people' | 'nature' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags';

export const CATEGORIES: Category[] = ['recent', 'people', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags'];

/** Unicode's groups, as macOS files them. */
const GROUPS: Record<string, Category> = {
    'Smileys & Emotion': 'people',
    'People & Body': 'people',
    'Animals & Nature': 'nature',
    'Food & Drink': 'food',
    Activities: 'activity',
    'Travel & Places': 'travel',
    Objects: 'objects',
    Symbols: 'symbols',
    Flags: 'flags',
};

/** How many picks Frequently Used keeps. */
export const RECENT_MAX = 27;

/** Parses `EMOJI_DATA`: group, emoji and name, tab separated, one per line. */
export function parseEmoji(data: string): Emoji[] {
    const list: Emoji[] = [];
    for (const line of data.split('\n')) {
        const [group, char, name] = line.split('\t');
        const category = GROUPS[group];
        if (category && char && name) list.push({ char, name, category });
    }
    return list;
}

/**
 * The emoji whose name has a word starting with each word of `query`: the
 * one named just that first, then names starting with it (shortest first),
 * then the rest in Unicode's order.
 */
export function searchEmoji(list: Emoji[], query: string, limit = 90): Emoji[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const phrase = words.join(' ');
    const matches = list.filter((emoji) => {
        const nameWords = emoji.name.toLowerCase().split(/[\s:,.()-]+/);
        return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
    });
    const tier = (emoji: Emoji) => {
        const name = emoji.name.toLowerCase();
        return name === phrase ? 0 : name.startsWith(phrase) ? 1 : 2;
    };
    // Array.sort is stable: the rest keep Unicode's order.
    return matches
        .map((emoji) => ({ emoji, tier: tier(emoji) }))
        .sort((a, b) => a.tier - b.tier || (a.tier === 1 ? a.emoji.name.length - b.emoji.name.length : 0))
        .slice(0, limit)
        .map(({ emoji }) => emoji);
}

/** The Frequently Used list after picking `char`: it moves to the front. */
export function pushRecent(recent: string[], char: string): string[] {
    return [char, ...recent.filter((other) => other !== char)].slice(0, RECENT_MAX);
}

/** The emoji to show for `category`; Frequently Used in pick order. */
export function inCategory(list: Emoji[], category: Category, recent: string[]): Emoji[] {
    if (category !== 'recent') return list.filter((emoji) => emoji.category === category);
    const byChar = new Map(list.map((emoji) => [emoji.char, emoji]));
    return recent.flatMap((char) => byChar.get(char) ?? []);
}
