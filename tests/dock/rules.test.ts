import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clickAction, nextWindow, overlaps } from '../../src/features/dock/logic/rules.js';

test('rectangles overlap only when they share area', () => {
    const dock = { x: 400, y: 800, width: 600, height: 64 };
    assert.equal(overlaps(dock, { x: 0, y: 0, width: 1920, height: 1080 }), true);
    assert.equal(overlaps(dock, { x: 0, y: 0, width: 1920, height: 800 }), false, 'touching the top edge');
    assert.equal(overlaps(dock, { x: 1000, y: 700, width: 300, height: 300 }), false, 'touching the right edge');
    assert.equal(overlaps(dock, { x: 999, y: 863, width: 10, height: 10 }), true);
});

test('next window cycles and wraps', () => {
    assert.equal(nextWindow(['a', 'b', 'c'], 'a'), 'b');
    assert.equal(nextWindow(['a', 'b', 'c'], 'c'), 'a');
    assert.equal(nextWindow(['a', 'b'], 'x'), 'a');
    assert.equal(nextWindow([], 'a'), null);
});

test('clicking a focused app minimizes its only window or cycles', () => {
    const base = { running: true, focused: true, windowsHere: 1, newWindow: false };
    assert.equal(clickAction(base), 'minimize');
    assert.equal(clickAction({ ...base, windowsHere: 3 }), 'cycle');
    assert.equal(clickAction({ ...base, focused: false }), 'default');
    assert.equal(clickAction({ ...base, running: false }), 'default');
    assert.equal(clickAction({ ...base, newWindow: true }), 'default');
    assert.equal(clickAction({ ...base, windowsHere: 0 }), 'default');
});
