import assert from 'node:assert/strict';
import { test } from 'node:test';

import { placeWindow } from '../../src/shared/logic/geometry.js';

const area = { x: 0, y: 28, width: 1535, height: 836 };
const current = { x: 100, y: 100, width: 800, height: 500 };

test('left and right halves share the work area without a gap', () => {
    const left = placeWindow('left', area, current);
    const right = placeWindow('right', area, current);
    assert.deepEqual(left, { x: 0, y: 28, width: 767, height: 836 });
    assert.deepEqual(right, { x: 767, y: 28, width: 768, height: 836 });
});

test('fill takes the whole work area', () => {
    assert.deepEqual(placeWindow('fill', area, current), area);
});

test('center keeps the size and centres it', () => {
    assert.deepEqual(placeWindow('center', area, current), { x: 367, y: 196, width: 800, height: 500 });
});

test('center shrinks a window bigger than the work area', () => {
    assert.deepEqual(placeWindow('center', area, { x: 0, y: 0, width: 2000, height: 1000 }), area);
});
