import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromSaved, shownWallpaper, startWallpapers, toSaved, type Wallpaper } from '../../src/features/spacewallpapers/logic/wallpapers.js';

const sea: Wallpaper = { light: 'file:///sea.jpg', dark: 'file:///sea-night.jpg' };
const hill: Wallpaper = { light: 'file:///hill.jpg', dark: 'file:///hill.jpg' };
const city: Wallpaper = { light: 'file:///city.jpg', dark: 'file:///city.jpg' };
const none: Wallpaper = { light: '', dark: '' };

test('the first time, every desktop shows the wallpaper the user has', () => {
    assert.deepEqual(startWallpapers([], sea, 3), [sea, null, null]);
});

test('desktops get back the wallpapers they had, Desktop 1’s being the one GNOME kept', () => {
    assert.deepEqual(startWallpapers([sea, none, hill], sea, 3), [sea, null, hill]);
});

test('a wallpaper picked while Macr was off becomes Desktop 1’s', () => {
    assert.deepEqual(startWallpapers([sea, hill], city, 2), [city, hill]);
});

test('saved wallpapers for desktops that are gone are dropped, new ones follow Desktop 1', () => {
    assert.deepEqual(startWallpapers([sea, hill, city], sea, 2), [sea, hill]);
    assert.deepEqual(startWallpapers([sea], sea, 2), [sea, null]);
});

test('a desktop with no wallpaper of its own shows Desktop 1’s', () => {
    assert.deepEqual(shownWallpaper([sea, null, hill], 1), sea);
    assert.deepEqual(shownWallpaper([sea, null, hill], 2), hill);
    assert.deepEqual(shownWallpaper([sea, null, hill], 7), sea);
});

test('wallpapers are kept as pairs of URIs, empty for a desktop that follows Desktop 1', () => {
    const own = [sea, null, hill];
    assert.deepEqual(toSaved(own), [['file:///sea.jpg', 'file:///sea-night.jpg'], ['', ''], ['file:///hill.jpg', 'file:///hill.jpg']]);
    assert.deepEqual(fromSaved(toSaved(own)), [sea, none, hill]);
});
