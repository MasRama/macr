// Spotlight's online answers: web search suggestions and dictionary definitions.

export interface Definition {
    word: string;
    phonetic: string | null;
    partOfSpeech: string;
    definition: string;
}

export function searchUrl(query: string): string {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** Google's suggestions, as the JSON Firefox reads: `[query, [suggestions]]`. */
export function suggestUrl(query: string): string {
    return `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
}

/** Free Dictionary API (Wiktionary's English definitions). */
export function definitionUrl(word: string): string {
    return `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`;
}

/** The word's Wiktionary page, where its definitions come from. */
export function wiktionaryUrl(word: string): string {
    return `https://en.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}`;
}

/** Up to `max` suggestions, leaving out the query itself and computed answers ("= 6.2 miles"). */
export function parseSuggestions(json: string, query: string, max: number): string[] {
    try {
        const data = JSON.parse(json) as unknown;
        if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
        const typed = query.trim().toLowerCase();
        return (data[1] as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().toLowerCase() !== typed && !item.startsWith('=')).slice(0, max);
    } catch {
        return [];
    }
}

interface Entry {
    word?: string;
    phonetic?: string;
    meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

/** The first definition of the word, or null when the dictionary has none. */
export function parseDefinition(json: string): Definition | null {
    let entries: unknown;
    try {
        entries = JSON.parse(json);
    } catch {
        return null;
    }
    if (!Array.isArray(entries)) return null;
    for (const entry of entries as Entry[]) {
        for (const meaning of entry.meanings ?? []) {
            const definition = meaning.definitions?.find((item) => item.definition)?.definition;
            if (entry.word && definition) {
                return { word: entry.word, phonetic: entry.phonetic ?? null, partOfSpeech: meaning.partOfSpeech ?? '', definition };
            }
        }
    }
    return null;
}

/** One word of letters (an apostrophe or hyphen inside is fine): worth a dictionary lookup. */
export function isWord(terms: string[]): boolean {
    return terms.length === 1 && /^\p{L}[\p{L}'’-]*\p{L}$/u.test(terms[0]);
}
