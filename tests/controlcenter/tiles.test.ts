import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hiddenTiles, TILES, withTile } from '../../src/features/controlcenter/logic/tiles.js';

test('every tile shows until it is hidden; unknown ids are ignored', () => {
    assert.deepEqual(hiddenTiles([]), new Set());
    assert.deepEqual(hiddenTiles(['now-playing', 'gaming', 'sound']), new Set(['now-playing', 'sound']));
    assert.ok(TILES.includes('now-playing'));
});

test('showing or hiding a tile changes only its entry', () => {
    assert.deepEqual(withTile(['sound'], 'focus', false), ['sound', 'focus']);
    assert.deepEqual(withTile(['sound', 'focus'], 'sound', true), ['focus']);
    assert.deepEqual(withTile(['sound'], 'sound', false), ['sound'], 'no repeats');
});
