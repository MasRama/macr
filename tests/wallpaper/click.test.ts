import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isClick } from '../../src/features/wallpaper/logic/click.js';

test('a press let go where it was is a click', () => {
    assert.equal(isClick({ x: 100, y: 100, t: 0 }, { x: 103, y: 98, t: 120 }), true);
});

test('dragging a selection over the desktop is no click', () => {
    assert.equal(isClick({ x: 100, y: 100, t: 0 }, { x: 160, y: 140, t: 300 }), false);
});

test('holding the button down is no click', () => {
    assert.equal(isClick({ x: 100, y: 100, t: 0 }, { x: 100, y: 100, t: 900 }), false);
});
