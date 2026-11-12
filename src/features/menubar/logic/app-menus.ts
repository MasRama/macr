/** Reads one level of a GMenuModel; the GNOME side wraps Gio.MenuModel in this. */
export interface MenuReader {
    count(): number;
    /** An attribute's unpacked value, or null when the item has none. */
    attribute(index: number, name: string): unknown;
    link(index: number, name: 'section' | 'submenu'): MenuReader | null;
    /** The model behind this reader, kept on submenu nodes for the GNOME side. */
    source?: unknown;
}

export type MenuNode =
    | { kind: 'item'; label: string; action: string | null; target: unknown; accel: string; hiddenWhen?: string }
    | { kind: 'submenu'; label: string; submenuAction: string | null; children: MenuNode[]; source?: unknown }
    | { kind: 'section'; children: MenuNode[] };

export type SubmenuNode = Extract<MenuNode, { kind: 'submenu' }>;

/** "_File" reads "File"; "__" is a real underscore. */
export function stripMnemonic(label: string): string {
    return label.replace(/_(_?)/g, (_match, kept: string) => kept);
}

const MODIFIERS: [RegExp, string][] = [
    [/<(Primary|Control|Ctrl)>/i, '⌃'],
    [/<Alt>/i, '⌥'],
    [/<Shift>/i, '⇧'],
    [/<(Super|Meta)>/i, '⌘'],
];

// macOS lists modifiers in this order.
const ORDER = ['⌃', '⌥', '⇧', '⌘'];

const KEYS: Record<string, string> = {
    space: 'Space', plus: '+', minus: '-', equal: '=', comma: ',', period: '.', slash: '/',
    backslash: '\\', semicolon: ';', apostrophe: "'", bracketleft: '[', bracketright: ']', grave: '`',
    delete: '⌦', backspace: '⌫', return: '↩', kp_enter: '⌤', escape: '⎋', tab: '⇥',
    left: '←', right: '→', up: '↑', down: '↓', page_up: '⇞', page_down: '⇟', home: '↖', end: '↘',
};

/** A GTK accelerator such as "<Primary><Shift>s" in macOS symbols, "⌃⇧S". */
export function accelLabel(accel: string | null): string {
    if (!accel) return '';
    let rest = accel;
    const found = new Set<string>();
    for (const [pattern, symbol] of MODIFIERS) {
        while (pattern.test(rest)) {
            rest = rest.replace(pattern, '');
            found.add(symbol);
        }
    }
    rest = rest.replace(/<[^>]*>/g, '');
    const key = KEYS[rest.toLowerCase()] ?? (rest.length === 1 ? rest.toUpperCase() : rest);
    return ORDER.filter((symbol) => found.has(symbol)).join('') + key;
}

function text(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

/** The whole menu tree under a model; items that cannot show are left out. */
export function readMenu(menu: MenuReader): MenuNode[] {
    const nodes: MenuNode[] = [];
    for (let i = 0; i < menu.count(); i++) {
        const hiddenWhen = text(menu.attribute(i, 'hidden-when'));
        if (hiddenWhen === 'macos-menubar') continue;
        const section = menu.link(i, 'section');
        if (section) {
            nodes.push({ kind: 'section', children: readMenu(section) });
            continue;
        }
        const label = text(menu.attribute(i, 'label'));
        if (!label) continue;
        const submenu = menu.link(i, 'submenu');
        if (submenu) {
            nodes.push({
                kind: 'submenu',
                label: stripMnemonic(label),
                submenuAction: text(menu.attribute(i, 'submenu-action')),
                children: readMenu(submenu),
                ...(submenu.source !== undefined && { source: submenu.source }),
            });
            continue;
        }
        const target = menu.attribute(i, 'target');
        nodes.push({
            kind: 'item',
            label: stripMnemonic(label),
            action: text(menu.attribute(i, 'action')),
            target: target ?? null,
            accel: accelLabel(text(menu.attribute(i, 'accel'))),
            // "action-missing" and "action-disabled" depend on the live actions.
            ...(hiddenWhen && { hiddenWhen }),
        });
    }
    return nodes;
}

export type EntryNode = Exclude<MenuNode, { kind: 'section' }>;

/**
 * A menu's entries in groups, one per section however deeply the app nested
 * them; a menu shows a separator between groups. Empty groups are dropped.
 */
export function groupEntries(nodes: MenuNode[]): EntryNode[][] {
    const groups: EntryNode[][] = [];
    let current: EntryNode[] = [];
    const close = () => {
        if (current.length > 0) groups.push(current);
        current = [];
    };
    const walk = (list: MenuNode[]) => {
        for (const node of list) {
            if (node.kind === 'section') {
                close();
                walk(node.children);
                close();
            } else current.push(node);
        }
    };
    walk(nodes);
    close();
    return groups;
}

/** Every top-level menu, wherever the app nested it in sections. */
function topLevel(nodes: MenuNode[]): SubmenuNode[] {
    return nodes.flatMap((node) => node.kind === 'section' ? topLevel(node.children) : node.kind === 'submenu' ? [node] : []);
}

/**
 * The app's menus as the macOS menu bar shows them: its own menus after the
 * app name, no Window menu of its own (Macr's Window menu already lists the
 * app's windows), and Help last, after Window.
 */
export function arrangeMenus(nodes: MenuNode[]): { menus: SubmenuNode[]; help: SubmenuNode | null } {
    const seen = new Set<string>();
    const menus: SubmenuNode[] = [];
    let help: SubmenuNode | null = null;
    for (const menu of topLevel(nodes)) {
        const name = menu.label.trim().toLowerCase();
        if (seen.has(name)) continue;
        seen.add(name);
        if (name === 'window') continue;
        if (name === 'help') help = menu;
        else menus.push(menu);
    }
    return { menus, help };
}
