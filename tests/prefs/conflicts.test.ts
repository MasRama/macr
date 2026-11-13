import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clashes } from '../../src/prefs/logic/conflicts.js';

const allOn = (key: string) => key !== 'none';

test('nothing clashes when no known extension is enabled', () => {
    assert.deepEqual(clashes(['nokta@nokta.io', 'user-theme@gnome-shell-extensions.gcampax.github.com'], allOn), []);
});

test('Dash to Dock clashes with the dock while the dock is on', () => {
    assert.deepEqual(clashes(['dash-to-dock@micxgx.gmail.com'], allOn), [
        { uuid: 'dash-to-dock@micxgx.gmail.com', name: 'Dash to Dock', setting: 'dock-enabled', partial: false },
    ]);
});

test('a clash is dropped while its Macr module is off', () => {
    assert.deepEqual(clashes(['dash-to-dock@micxgx.gmail.com'], (key) => key !== 'dock-enabled'), []);
});

test('Blur my Shell only clashes in part, with the menu bar', () => {
    const [clash] = clashes(['blur-my-shell@aunetx'], allOn);
    assert.equal(clash?.setting, 'menubar-enabled');
    assert.equal(clash?.partial, true);
});

test('an extension that fights two modules is listed once, for the first one that is on', () => {
    const found = clashes(['just-perfection-desktop@just-perfection'], allOn);
    assert.equal(found.length, 1);
});

test('keeps the order of the enabled list', () => {
    const found = clashes(['compiz-alike-magic-lamp-effect@hermes83.github.com', 'dash-to-dock@micxgx.gmail.com'], allOn);
    assert.deepEqual(found.map((c) => c.name), ['Magic Lamp', 'Dash to Dock']);
});

test('settings that do not exist yet count as off', () => {
    assert.deepEqual(clashes(['tilingshell@ferrarodomenico.com'], (key) => key !== 'tiling-enabled'), []);
});
