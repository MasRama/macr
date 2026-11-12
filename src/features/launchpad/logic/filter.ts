export interface Searchable {
    name: string;
    keywords?: string[];
    executable?: string;
}

/** Lower case without accents, so "cafe" finds "Café". */
function fold(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function termScore(term: string, item: Searchable): number {
    const name = fold(item.name);
    if (name.startsWith(term)) return 4;
    if (name.split(/[\s\-_.]+/).some((word) => word.startsWith(term))) return 3;
    if (name.includes(term)) return 2;
    const extra = [...(item.keywords ?? []), item.executable ?? ''].map(fold);
    if (extra.some((word) => word.startsWith(term))) return 1;
    return 0;
}

/** How well `item` matches `query`: 0 when some word of the query does not match. */
export function matchScore(query: string, item: Searchable): number {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    let total = 0;
    for (const term of terms) {
        const score = termScore(term, item);
        if (score === 0) return 0;
        total += score;
    }
    return total;
}

/** The items matching `query`, best first; an empty query keeps them all in order. */
export function filterApps<T extends Searchable>(items: T[], query: string): T[] {
    if (!query.trim()) return items;
    return items
        .map((item, index) => ({ item, index, score: matchScore(query, item) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.item);
}
