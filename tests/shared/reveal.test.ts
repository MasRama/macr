import assert from 'node:assert/strict';
import { test } from 'node:test';

import { revealOffset, sliverOf } from '../../src/shared/logic/reveal.js';

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

test('a window moves to the nearer side edge, leaving a sliver', () => {
    const left = { x: 100, y: 200, width: 600, height: 400 };
    assert.deepEqual(revealOffset(left, screen, [screen], 30), { x: -670, y: 0 });
    const right = { x: 1100, y: 200, width: 600, height: 400 };
    assert.deepEqual(revealOffset(right, screen, [screen], 30), { x: 790, y: 0 });
});

test('a centred window goes right', () => {
    const middle = { x: 460, y: 0, width: 1000, height: 1080 };
    assert.equal(revealOffset(middle, screen, [screen], 30).x, 1430);
});

test('a side another monitor touches is not used', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    const right = { x: 1100, y: 200, width: 600, height: 400 };
    assert.deepEqual(revealOffset(right, screen, [screen, second], 30), { x: -1670, y: 0 });
    const third = { x: -1920, y: 0, width: 1920, height: 1080 };
    assert.deepEqual(revealOffset(right, screen, [third, screen, second], 30), { x: 0, y: 850 });
});

test('a monitor beside but not level does not count', () => {
    const above = { x: 1920, y: -2000, width: 1920, height: 1080 };
    const right = { x: 1100, y: 200, width: 600, height: 400 };
    assert.equal(revealOffset(right, screen, [screen, above], 30).x, 790);
});

test('a window already off the edge stays where it is', () => {
    const out = { x: -580, y: 0, width: 600, height: 400 };
    assert.deepEqual(revealOffset(out, screen, [screen], 30), { x: 0, y: 0 });
});

test('the sliver is the part left on the monitor', () => {
    const frame = { x: 100, y: 200, width: 600, height: 400 };
    assert.deepEqual(sliverOf(frame, { x: -670, y: 0 }, screen), { x: 0, y: 200, width: 30, height: 400 });
    assert.equal(sliverOf(frame, { x: -2000, y: 0 }, screen), null);
});
