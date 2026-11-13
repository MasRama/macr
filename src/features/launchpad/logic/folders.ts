// Launchpad folders, kept in GNOME's own app folder settings
// (org.gnome.desktop.app-folders), so GNOME's app grid shows the same ones.

export interface FolderDef {
    id: string;
    name: string;
    /** Apps put in the folder by hand. */
    apps: string[];
    /** Every app in one of these categories joins the folder... */
    categories: string[];
    /** ...unless it was taken out. */
    excluded: string[];
    /** `name` is a .directory file whose translated name shows. */
    translate: boolean;
}

export interface AppFacts {
    id: string;
    name: string;
    categories: string[];
}

export type GridItem = { kind: 'app'; id: string } | { kind: 'folder'; id: string; apps: string[] };

const byName = (a: string, b: string): number => a.localeCompare(b);

/** The installed apps (of `apps`) that `folder` holds, by name, as GNOME counts them. */
export function folderApps(folder: FolderDef, apps: AppFacts[]): string[] {
    const own = new Set(folder.apps);
    const excluded = new Set(folder.excluded);
    return apps
        .filter((app) => !excluded.has(app.id) && (own.has(app.id) || app.categories.some((category) => folder.categories.includes(category))))
        .sort((a, b) => byName(a.name, b.name))
        .map((app) => app.id);
}

/**
 * The main grid: every folder that holds an app, and every app no folder
 * holds, by name. `folderName` is the name a folder shows.
 */
export function gridItems(folders: FolderDef[], apps: AppFacts[], folderName: (folder: FolderDef) => string): GridItem[] {
    const inFolders = new Set<string>();
    const named: { name: string; item: GridItem }[] = [];
    for (const folder of folders) {
        const held = folderApps(folder, apps);
        if (held.length === 0) continue;
        for (const id of held) inFolders.add(id);
        named.push({ name: folderName(folder), item: { kind: 'folder', id: folder.id, apps: held } });
    }
    for (const app of apps) if (!inFolders.has(app.id)) named.push({ name: app.name, item: { kind: 'app', id: app.id } });
    return named.sort((a, b) => byName(a.name, b.name)).map(({ item }) => item);
}

/** The folder's lists with `app` put in. */
export function withApp(folder: FolderDef, app: string): { apps: string[]; excluded: string[] } {
    return {
        apps: folder.apps.includes(app) ? [...folder.apps] : [...folder.apps, app],
        excluded: folder.excluded.filter((id) => id !== app),
    };
}

/** The folder's lists with `app` taken out; an app there by category is excluded. */
export function withoutApp(folder: FolderDef, app: AppFacts): { apps: string[]; excluded: string[] } {
    const byCategory = app.categories.some((category) => folder.categories.includes(category));
    const excluded = byCategory && !folder.excluded.includes(app.id) ? [...folder.excluded, app.id] : [...folder.excluded];
    return { apps: folder.apps.filter((id) => id !== app.id), excluded };
}

/** Desktop categories too broad to name a folder after. */
const GENERIC = new Set(['GNOME', 'GTK', 'Qt', 'KDE', 'Application', 'X-GNOME-Settings-Panel']);

/** Categories every list shares, in the first list's order: candidates for a new folder's name. */
export function commonCategories(lists: string[][]): string[] {
    if (lists.length === 0) return [];
    return [...new Set(lists[0])].filter((category) => category && !GENERIC.has(category) && lists.every((list) => list.includes(category)));
}

/** A desktop file's Categories value as a list. */
export function parseCategories(value: string | null): string[] {
    return (value ?? '').split(';').filter(Boolean);
}
