import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterApps, matchScore } from '../../src/features/launchpad/logic/filter.js';

const apps = [
    { name: 'Text Editor', keywords: ['notepad', 'txt'], executable: 'gnome-text-editor' },
    { name: 'Terminal', keywords: ['shell', 'prompt'], executable: 'gnome-terminal' },
    { name: 'Files', keywords: ['folder', 'explorer'], executable: 'nautilus' },
    { name: 'Calculator', keywords: [], executable: 'gnome-calculator' },
    { name: 'Zoë Café', keywords: [], executable: 'zoe' },
];

test('an empty query keeps every app in order', () => {
    assert.deepEqual(filterApps(apps, '  '), apps);
});

test('name prefix beats a later word beats keywords', () => {
    assert.ok(matchScore('te', apps[0]) > 0);
    assert.ok(matchScore('ter', apps[1]) > matchScore('edi', apps[0]), 'name start beats a later word');
    assert.ok(matchScore('edi', apps[0]) > matchScore('shell', apps[1]), 'a word beats a keyword');
    assert.ok(matchScore('naut', apps[2]) > 0, 'executable');
    assert.equal(matchScore('xyz', apps[0]), 0);
});

test('results are ranked, ties keep their order', () => {
    assert.deepEqual(
        filterApps(apps, 'te').map((app) => app.name),
        ['Text Editor', 'Terminal'],
    );
    assert.deepEqual(
        filterApps(apps, 'editor').map((app) => app.name),
        ['Text Editor'],
    );
});

test('every word must match, accents and case are ignored', () => {
    assert.deepEqual(filterApps(apps, 'text ed').map((app) => app.name), ['Text Editor']);
    assert.deepEqual(filterApps(apps, 'text term'), []);
    assert.deepEqual(filterApps(apps, 'CAFE').map((app) => app.name), ['Zoë Café']);
});
