import assert from 'node:assert/strict';
import { test } from 'node:test';

import { returnIndex, shouldMove } from '../../src/features/spaces/logic/spaces.js';

const base = { normal: true, onAllWorkspaces: false, addsSpaces: true, othersShowing: 2 };

test('a normal full-screen window with company moves to its own Space', () => {
    assert.equal(shouldMove(base), true);
});

test('dialogs, sticky windows, fixed workspaces Macr does not manage and lone windows stay', () => {
    assert.equal(shouldMove({ ...base, normal: false }), false);
    assert.equal(shouldMove({ ...base, onAllWorkspaces: true }), false);
    assert.equal(shouldMove({ ...base, addsSpaces: false }), false);
    assert.equal(shouldMove({ ...base, othersShowing: 0 }), false);
});

test('a window goes back to where it came from, or the nearest workspace left', () => {
    assert.equal(returnIndex(2, 5), 2);
    assert.equal(returnIndex(4, 3), 2);
    assert.equal(returnIndex(0, 1), 0);
    assert.equal(returnIndex(-1, 3), 0);
});
