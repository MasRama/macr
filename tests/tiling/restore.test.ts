import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dragOffRect, pulledOff } from '../../src/features/tiling/logic/restore.js';

const tile = { x: 964, y: 40, width: 948, height: 1032 };
const size = { width: 800, height: 600 };

test('the grab point keeps its share of the window when it shrinks back', () => {
    // Grabbed 536 of 948 px across and 20 of 1032 down: 452 of 800 and 12 of 600.
    const grab = { x: 1500, y: 60 };
    assert.deepEqual(dragOffRect(grab, grab, tile, size), { x: 1048, y: 48, width: 800, height: 600 });
});

test('the window follows the pointer from where it has got to', () => {
    const grab = { x: 1500, y: 60 };
    assert.deepEqual(dragOffRect(grab, { x: 1510, y: 75 }, tile, size), { x: 1058, y: 63, width: 800, height: 600 });
});

test('a grab near the right edge stays near the right edge', () => {
    const grab = { x: 1900, y: 60 };
    assert.equal(dragOffRect(grab, grab, tile, size).x, 1110);
});

test('a tile is pulled off once the pointer has moved a few pixels', () => {
    assert.equal(pulledOff({ x: 100, y: 100 }, { x: 104, y: 103 }), false);
    assert.equal(pulledOff({ x: 100, y: 100 }, { x: 110, y: 100 }), true);
    assert.equal(pulledOff({ x: 100, y: 100 }, { x: 100, y: 92 }), true);
});
