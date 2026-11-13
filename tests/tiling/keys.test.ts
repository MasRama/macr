import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeAccelerator, sameList, withoutClashes } from '../../src/features/tiling/logic/keys.js';

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
