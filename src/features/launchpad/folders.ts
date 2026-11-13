import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { type AppFacts, commonCategories, type FolderDef, folderApps, withApp, withoutApp } from './logic/folders.js';

const SCHEMA = 'org.gnome.desktop.app-folders';
const FOLDER_SCHEMA = 'org.gnome.desktop.app-folders.folder';
const FOLDER_PATH = '/org/gnome/desktop/app-folders/folders/';

/**
 * GNOME's app folders (the same ones its app grid shows), read and changed
 * the way GNOME's own AppDisplay does. `changed` runs after any change,
 * Macr's or anyone else's.
 */
export class FolderStore {
    private readonly settings = new Gio.Settings({ schema_id: SCHEMA });
    private readonly folders = new Map<string, { settings: Gio.Settings; id: number }>();
    private readonly childrenId: number;

    constructor(private readonly changed: () => void) {
        this.childrenId = this.settings.connect('changed::folder-children', () => {
            this.sync();
            this.changed();
        });
        this.sync();
    }

    destroy(): void {
        this.settings.disconnect(this.childrenId);
        for (const { settings, id } of this.folders.values()) settings.disconnect(id);
        this.folders.clear();
    }

    defs(): FolderDef[] {
        return [...this.folders].map(([id, { settings }]) => ({
            id,
            name: settings.get_string('name'),
            apps: settings.get_strv('apps'),
            categories: settings.get_strv('categories'),
            excluded: settings.get_strv('excluded-apps'),
            translate: settings.get_boolean('translate'),
        }));
    }

    /** The name a folder shows: a .directory file's translation, or its own. */
    displayName(folder: FolderDef): string {
        if (folder.translate) return Shell.util_get_translated_folder_name(folder.name) ?? folder.name;
        return folder.name;
    }

    /** A new folder holding `apps`, named after a category they share. */
    create(apps: AppFacts[]): string {
        const id = GLib.uuid_string_random();
        let name = _('Untitled Folder');
        for (const category of commonCategories(apps.map((app) => app.categories))) {
            const translated = Shell.util_get_translated_folder_name(`${category}.directory`);
            if (translated) {
                name = translated;
                break;
            }
        }
        const settings = this.folderSettings(id);
        settings.delay();
        settings.set_string('name', name);
        settings.set_strv(
            'apps',
            apps.map((app) => app.id),
        );
        settings.apply();
        this.settings.set_strv('folder-children', [...this.settings.get_strv('folder-children'), id]);
        return id;
    }

    add(id: string, app: string): void {
        const folder = this.def(id);
        if (!folder) return;
        const next = withApp(folder, app);
        const settings = this.folders.get(id)!.settings;
        settings.delay();
        settings.set_strv('apps', next.apps);
        settings.set_strv('excluded-apps', next.excluded);
        settings.apply();
    }

    /** Takes `app` out; a folder left empty goes. */
    remove(id: string, app: AppFacts, installed: AppFacts[]): void {
        const folder = this.def(id);
        if (!folder) return;
        const next = withoutApp(folder, app);
        const settings = this.folders.get(id)!.settings;
        if (folderApps({ ...folder, ...next }, installed).length === 0) {
            this.settings.set_strv(
                'folder-children',
                this.settings.get_strv('folder-children').filter((child) => child !== id),
            );
            for (const key of settings.settings_schema.list_keys()) settings.reset(key);
            return;
        }
        settings.delay();
        settings.set_strv('apps', next.apps);
        settings.set_strv('excluded-apps', next.excluded);
        settings.apply();
    }

    rename(id: string, name: string): void {
        const settings = this.folders.get(id)?.settings;
        if (!settings) return;
        settings.delay();
        settings.set_string('name', name);
        settings.set_boolean('translate', false);
        settings.apply();
    }

    private def(id: string): FolderDef | undefined {
        return this.defs().find((folder) => folder.id === id);
    }

    private folderSettings(id: string): Gio.Settings {
        return new Gio.Settings({ schema_id: FOLDER_SCHEMA, path: `${FOLDER_PATH}${id}/` });
    }

    /** One Gio.Settings per folder in folder-children. */
    private sync(): void {
        const ids = this.settings.get_strv('folder-children');
        for (const [id, { settings, id: handler }] of this.folders) {
            if (ids.includes(id)) continue;
            settings.disconnect(handler);
            this.folders.delete(id);
        }
        for (const id of ids) {
            if (this.folders.has(id)) continue;
            const settings = this.folderSettings(id);
            this.folders.set(id, { settings, id: settings.connect('changed', () => this.changed()) });
        }
    }
}
