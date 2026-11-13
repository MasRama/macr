import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type AppFacts, commonCategories, type FolderDef, folderApps, gridItems, parseCategories, withApp, withoutApp } from '../../src/features/launchpad/logic/folders.js';

const apps: AppFacts[] = [
    { id: 'calc', name: 'Calculator', categories: ['Utility'] },
    { id: 'chars', name: 'Characters', categories: ['Utility', 'X-GNOME-Utilities'] },
    { id: 'disks', name: 'Disks', categories: ['System', 'X-GNOME-Utilities'] },
    { id: 'files', name: 'Files', categories: ['System', 'Utility'] },
    { id: 'term', name: 'Terminal', categories: ['System'] },
];

function folder(over: Partial<FolderDef>): FolderDef {
    return { id: 'f', name: 'Folder', apps: [], categories: [], excluded: [], translate: false, ...over };
}

test('a folder holds its own apps and its categories, by name', () => {
    const utilities = folder({ apps: ['term'], categories: ['X-GNOME-Utilities'] });
    assert.deepEqual(folderApps(utilities, apps), ['chars', 'disks', 'term']);
});

test('an excluded app stays out of its category folder', () => {
    const utilities = folder({ categories: ['X-GNOME-Utilities'], excluded: ['disks'] });
    assert.deepEqual(folderApps(utilities, apps), ['chars']);
});

test('apps that are not installed do not count', () => {
    assert.deepEqual(folderApps(folder({ apps: ['gone', 'calc'] }), apps), ['calc']);
});

test('the grid shows folders with apps and the apps no folder holds, by name', () => {
    const items = gridItems(
        [folder({ id: 'u', name: 'Utilities', apps: ['calc', 'chars'] }), folder({ id: 'e', name: 'Empty', apps: ['gone'] })],
        apps,
        (f) => f.name,
    );
    assert.deepEqual(items, [
        { kind: 'app', id: 'disks' },
        { kind: 'app', id: 'files' },
        { kind: 'app', id: 'term' },
        { kind: 'folder', id: 'u', apps: ['calc', 'chars'] },
    ]);
});

test('folders sort by the name they show', () => {
    const items = gridItems([folder({ id: 'u', name: 'X-GNOME-Utilities.directory', apps: ['calc'] })], apps, () => 'Accessories');
    assert.deepEqual(items[0], { kind: 'folder', id: 'u', apps: ['calc'] });
});

test('putting an app in a folder adds it once and lifts its exclusion', () => {
    const utilities = folder({ apps: ['calc'], categories: ['X-GNOME-Utilities'], excluded: ['disks'] });
    assert.deepEqual(withApp(utilities, 'disks'), { apps: ['calc', 'disks'], excluded: [] });
    assert.deepEqual(withApp(utilities, 'calc'), { apps: ['calc'], excluded: ['disks'] });
});

test('taking an app out removes it, and excludes it when its category put it there', () => {
    const utilities = folder({ apps: ['calc', 'chars'], categories: ['X-GNOME-Utilities'] });
    assert.deepEqual(withoutApp(utilities, apps[0]), { apps: ['chars'], excluded: [] });
    assert.deepEqual(withoutApp(utilities, apps[1]), { apps: ['calc'], excluded: ['chars'] });
});

test('a new folder is named after a category its apps share', () => {
    assert.deepEqual(commonCategories([['GNOME', 'GTK', 'Utility', 'Calculator'], ['GTK', 'Utility']]), ['Utility']);
    assert.deepEqual(commonCategories([['Game'], ['Office']]), []);
    assert.deepEqual(commonCategories([]), []);
});

test('desktop categories split on semicolons', () => {
    assert.deepEqual(parseCategories('GNOME;GTK;Utility;'), ['GNOME', 'GTK', 'Utility']);
    assert.deepEqual(parseCategories(null), []);
});
