import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clickAction, nextWindow } from '../../src/features/dock/logic/rules.js';

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
