/**
 * Lets Spotlight's Clipboard view open the clipboard history without the two
 * modules knowing each other: the clipboard module registers itself while it
 * runs.
 */
export interface ClipboardLink {
    /** Opens the history, searching for `query` when given. */
    open(query?: string): void;
}

let current: ClipboardLink | null = null;

/** The running clipboard history, if any. */
export function clipboardHistory(): ClipboardLink | null {
    return current;
}

export function setClipboardHistory(link: ClipboardLink | null): void {
    current = link;
}
