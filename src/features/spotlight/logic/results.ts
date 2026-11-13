/** One search provider's results, in its own order. */
export interface ProviderResults<T> {
    id: string;
    title: string;
    results: T[];
}

export interface Section<T> {
    providerId: string;
    title: string;
    items: T[];
}

export interface Layout<T> {
    topHit: { providerId: string; item: T } | null;
    sections: Section<T>[];
}

export const APPS_PROVIDER = 'applications';
const LIMITS = { apps: 6, other: 4 };

/**
 * Spotlight's result list: a Top Hit (the first app, else the first result
 * of the first provider that found something), then one capped section per
 * provider, in provider order, without the Top Hit. A view (Apps, Files…)
 * turns both off and lists everything.
 */
export function layoutResults<T>(groups: ProviderResults<T>[], options = { topHit: true, capped: true }): Layout<T> {
    const apps = groups.find((group) => group.id === APPS_PROVIDER && group.results.length);
    const source = options.topHit ? (apps ?? groups.find((group) => group.results.length)) : undefined;
    const topHit = source ? { providerId: source.id, item: source.results[0] } : null;
    const sections: Section<T>[] = [];
    for (const group of groups) {
        const rest = group === source ? group.results.slice(1) : group.results;
        const items = options.capped ? rest.slice(0, group.id === APPS_PROVIDER ? LIMITS.apps : LIMITS.other) : rest;
        if (items.length) sections.push({ providerId: group.id, title: group.title, items });
    }
    return { topHit, sections };
}

/** `index` moved by `delta` over `count` rows, wrapping; -1 when there are none. */
export function wrapIndex(index: number, delta: number, count: number): number {
    if (count === 0) return -1;
    if (index < 0) return delta > 0 ? 0 : count - 1;
    return (((index + delta) % count) + count) % count;
}
