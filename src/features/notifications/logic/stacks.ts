// Notifications stacked per app in the Notification Center, as on macOS.

export interface StackView {
    /** Where the notification goes in the list. */
    index: number;
    shown: boolean;
    /** Alone, the top card of a closed stack, or part of an open one. */
    stack: 'none' | 'closed' | 'open';
    /** The stack's top card: it takes the clicks that open the stack. */
    top: boolean;
    /** How many notifications its stack holds. */
    count: number;
}

/**
 * How to show a list of notifications, given in GNOME's order (newest
 * first, urgent ones on top) as each one's app: an app's notifications
 * move up under its newest one, and only that one shows until its stack is
 * opened. Returns one view per notification, in the order given.
 */
export function stackViews<App>(apps: App[], open: ReadonlySet<App>): StackView[] {
    const groups = new Map<App, number[]>();
    apps.forEach((app, position) => {
        const group = groups.get(app);
        if (group) group.push(position);
        else groups.set(app, [position]);
    });
    const views: StackView[] = new Array(apps.length);
    let index = 0;
    // A Map keeps the order its keys came in: by each app's newest notification.
    for (const [app, positions] of groups) {
        const count = positions.length;
        const stack = count < 2 ? 'none' : open.has(app) ? 'open' : 'closed';
        positions.forEach((position, member) => {
            views[position] = { index: index++, shown: member === 0 || stack !== 'closed', stack, top: member === 0, count };
        });
    }
    return views;
}
