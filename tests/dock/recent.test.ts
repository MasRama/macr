import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RECENT_MAX, recentShown, withRecent, withoutRecent } from '../../src/features/dock/logic/recent.js';

test('a closed app goes first in the recent list', () => {
    assert.deepEqual(withRecent(['a.desktop', 'b.desktop'], 'c.desktop', []), ['c.desktop', 'a.desktop', 'b.desktop']);
});

test('an app closed again moves to the front, once', () => {
    assert.deepEqual(withRecent(['a.desktop', 'b.desktop'], 'b.desktop', []), ['b.desktop', 'a.desktop']);
});

test('apps in the dock are not recent apps', () => {
    assert.deepEqual(withRecent(['a.desktop', 'fav.desktop'], 'fav2.desktop', ['fav.desktop', 'fav2.desktop']), ['a.desktop']);
});

test('the list keeps the last three', () => {
    assert.equal(RECENT_MAX, 3);
    assert.deepEqual(withRecent(['a', 'b', 'c'], 'd', []), ['d', 'a', 'b']);
});

test('the dock shows recent apps that are neither running nor in the dock nor gone', () => {
    const shown = recentShown(['a', 'run', 'fav', 'gone', 'b', 'c'], {
        running: ['run'],
        favorites: ['fav'],
        installed: (id) => id !== 'gone',
    });
    assert.deepEqual(shown, ['a', 'b', 'c']);
});

test('the dock shows at most three recent apps', () => {
    assert.deepEqual(recentShown(['a', 'b', 'c', 'd'], { running: [], favorites: [], installed: () => true }), ['a', 'b', 'c']);
});

test('a recent app can be taken out of the dock, or all of them cleared', () => {
    const recent = ['org.gnome.Calculator.desktop', 'libreoffice-startcenter.desktop', 'org.gnome.Maps.desktop'];
    assert.deepEqual(withoutRecent(recent, 'libreoffice-startcenter.desktop'), ['org.gnome.Calculator.desktop', 'org.gnome.Maps.desktop']);
    assert.deepEqual(withoutRecent(recent, 'org.gnome.Weather.desktop'), recent);
    assert.deepEqual(withoutRecent(recent), []);
});
