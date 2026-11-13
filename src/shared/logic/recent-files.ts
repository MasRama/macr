export interface RecentFile {
    uri: string;
    name: string;
}

/**
 * Local files from ~/.local/share/recently-used.xbel, newest first. Whether
 * each file still exists is checked by the caller.
 */
export function recentFiles(xbel: string, limit: number): RecentFile[] {
    const entries: { uri: string; modified: number }[] = [];
    for (const match of xbel.matchAll(/<bookmark\b([^>]*)>/g)) {
        const attrs = match[1];
        const uri = /\bhref="([^"]+)"/.exec(attrs)?.[1];
        if (!uri || !uri.startsWith('file://')) continue;
        const modified = Date.parse(/\bmodified="([^"]+)"/.exec(attrs)?.[1] ?? '') || 0;
        entries.push({ uri: unescapeXml(uri), modified });
    }
    entries.sort((a, b) => b.modified - a.modified);
    const seen = new Set<string>();
    const files: RecentFile[] = [];
    for (const { uri } of entries) {
        if (seen.has(uri)) continue;
        seen.add(uri);
        files.push({ uri, name: fileName(uri) });
        if (files.length >= limit) break;
    }
    return files;
}

export function fileName(uri: string): string {
    const last = uri.replace(/\/+$/, '').split('/').pop() ?? uri;
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

function unescapeXml(text: string): string {
    return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
