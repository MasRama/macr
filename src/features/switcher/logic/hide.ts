/**
 * The item the switcher selects after H hid the selected one's app: the
 * next item of another app, so letting go of Alt does not bring the hidden
 * app straight back. `owners` holds each item's app (one item per app in
 * the app switcher, one per window in the window switcher). -1 closes the
 * switcher, when no other app is left.
 */
export function afterHide(selected: number, owners: readonly string[]): number {
    const hidden = owners[selected];
    for (let step = 1; step < owners.length; step++) {
        const index = (selected + step) % owners.length;
        if (owners[index] !== hidden) return index;
    }
    return -1;
}
