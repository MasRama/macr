import assert from 'node:assert/strict';
import { test } from 'node:test';

import { arrangement, arrangePartner } from '../../src/shared/logic/arrange.js';

test('each arrangement puts the focused window first', () => {
    assert.deepEqual(arrangement('left-right'), ['left', 'right']);
    assert.deepEqual(arrangement('right-left'), ['right', 'left']);
    assert.deepEqual(arrangement('top-bottom'), ['top', 'bottom']);
    assert.deepEqual(arrangement('bottom-top'), ['bottom', 'top']);
});

const window = (id: number, monitor = 0, minimized = false, tileable = true) => ({ id, monitor, minimized, tileable });

test('the partner is the window used before the focused one', () => {
    assert.equal(arrangePartner([window(1), window(2), window(3)], 1), 2);
    // The focused window need not be first in the list.
    assert.equal(arrangePartner([window(2), window(1), window(3)], 1), 2);
});

test('minimized and untileable windows are skipped', () => {
    assert.equal(arrangePartner([window(1), window(2, 0, true), window(3, 0, false, false), window(4)], 1), 4);
});

test('a window on the same monitor wins over a more recent one elsewhere', () => {
    assert.equal(arrangePartner([window(1, 0), window(2, 1), window(3, 0)], 1), 3);
    assert.equal(arrangePartner([window(1, 0), window(2, 1)], 1), 2);
});

test('no other window means no partner', () => {
    assert.equal(arrangePartner([window(1)], 1), null);
    assert.equal(arrangePartner([window(1), window(2, 0, true)], 1), null);
    assert.equal(arrangePartner([], 1), null);
});
