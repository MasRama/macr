import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSelection, spaceSwitchesTo } from '../../src/features/screenshot/logic/quick.js';

test('a drag captures once it is at least a few pixels each way', () => {
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 400, y: 300 }, 4), true);
    assert.equal(isSelection({ x: 400, y: 300 }, { x: 100, y: 100 }, 4), true, 'any direction');
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 104, y: 104 }, 4), true);
});

test('a click or a sliver does not capture', () => {
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 100, y: 100 }, 4), false);
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 102, y: 101 }, 4), false);
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 400, y: 102 }, 4), false, 'too thin');
    assert.equal(isSelection({ x: 100, y: 100 }, { x: 101, y: 400 }, 4), false, 'too narrow');
});

test('Space switches between the crosshair and the window picker', () => {
    assert.equal(spaceSwitchesTo('selection', true), 'window');
    assert.equal(spaceSwitchesTo('window', true), 'selection');
});

test('without windows to pick Space keeps the crosshair', () => {
    assert.equal(spaceSwitchesTo('selection', false), 'selection');
    assert.equal(spaceSwitchesTo('window', false), 'selection');
});
