/** The URI Quick Look can show for a result id: local files only. */
export function previewUri(id: string): string | null {
    return id.startsWith('file:///') ? id : null;
}

/**
 * Sushi reports its arrow keys as a Gtk.DirectionType: Up (2) and Left (4)
 * step back, Down (3) and Right (5) forward; anything else stays.
 */
export function selectionStep(direction: number): -1 | 0 | 1 {
    if (direction === 2 || direction === 4) return -1;
    if (direction === 3 || direction === 5) return 1;
    return 0;
}

/** The index one `step` on, kept inside a list of `length`; -1 for an empty list. */
export function stepIndex(index: number, step: number, length: number): number {
    if (length <= 0) return -1;
    return Math.max(0, Math.min(length - 1, index + step));
}
