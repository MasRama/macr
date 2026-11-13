import type { MenuNode, SubmenuNode } from './app-menus.js';

/** A menu item the Help menu's search found, with the menus that lead to it. */
export type FoundItem = Extract<MenuNode, { kind: 'item' }> & { path: string[] };

/** Lower case, without the ellipsis that dialog items carry. */
function normalize(text: string): string {
    return text.toLowerCase().replace(/…|\.\.\./g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The app's menu items that match a search, as macOS's Help menu finds
 * them: every word must be in the label; labels that start with the search
 * come first, then those with a word that does, each in menu order. Help
 * itself, which holds the search, and items with nothing to do are skipped.
 */
export function searchMenus(menus: SubmenuNode[], query: string, limit = 12): FoundItem[] {
    const search = normalize(query);
    if (!search) return [];
    const words = search.split(' ');
    const found: [number, FoundItem][] = [];
    const walk = (nodes: MenuNode[], path: string[]) => {
        for (const node of nodes) {
            if (node.kind === 'section') walk(node.children, path);
            else if (node.kind === 'submenu') walk(node.children, [...path, node.label]);
            else if (node.action) {
                const label = normalize(node.label);
                if (!words.every((word) => label.includes(word))) continue;
                const rank = label.startsWith(search) ? 0 : label.split(' ').some((word) => word.startsWith(words[0])) ? 1 : 2;
                found.push([rank, { ...node, path }]);
            }
        }
    };
    for (const menu of menus) {
        if (normalize(menu.label) !== 'help') walk(menu.children, [menu.label]);
    }
    // Array sort is stable, so menu order holds within a rank.
    return found.sort(([a], [b]) => a - b).slice(0, limit).map(([, item]) => item);
}

/** Every submenu's fill action, for apps that fill a menu only once it is shown. */
export function submenuActions(nodes: MenuNode[]): string[] {
    return nodes.flatMap((node) => {
        if (node.kind === 'item') return [];
        const own = node.kind === 'submenu' && node.submenuAction ? [node.submenuAction] : [];
        return [...own, ...submenuActions(node.children)];
    });
}
