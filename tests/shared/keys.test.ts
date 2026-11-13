import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canGiveBack, normalizeAccelerator, sameList, withoutClashes } from '../../src/shared/logic/keys.js';

test('accelerators that name the same keys match whatever their spelling', () => {
    assert.equal(normalizeAccelerator('<Primary><Super>Left'), normalizeAccelerator('<Super><Control>Left'));
    assert.equal(normalizeAccelerator('<Ctrl><Super>f'), normalizeAccelerator('<Super><Control>F'));
    assert.notEqual(normalizeAccelerator('<Super>Left'), normalizeAccelerator('<Super><Control>Left'));
    assert.notEqual(normalizeAccelerator('<Super><Control><Shift>Left'), normalizeAccelerator('<Super><Control>Left'));
});

test('only the bindings Macr uses itself are taken out', () => {
    const zorin = ['<Primary><Super>Left', '<Super>Left'];
    assert.deepEqual(withoutClashes(zorin, ['<Super><Control>Left', '<Super><Control>Right']), ['<Super>Left']);
    assert.deepEqual(withoutClashes(['<Super>Left'], ['<Super><Control>Left']), ['<Super>Left']);
    assert.deepEqual(withoutClashes(zorin, []), zorin);
});

test('lists compare in order', () => {
    assert.equal(sameList(['a', 'b'], ['a', 'b']), true);
    assert.equal(sameList(['a', 'b'], ['b', 'a']), false);
    assert.equal(sameList(['a'], ['a', 'b']), false);
});

test('a borrowed list goes back only while it is still what Macr made it', () => {
    const original = ['<Super>h', '<Alt>F9'];
    const ours = ['<Super>h'];
    assert.equal(canGiveBack(['<Alt>F9'], original, ours), true);
    assert.equal(canGiveBack(['<Alt>F9', '<Super>n'], original, ours), false);
    assert.equal(canGiveBack([], original, ours), false);
});
