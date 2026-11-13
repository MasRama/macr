import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hideTargets, unhideTargets } from '../../src/shared/logic/hide.js';

test('hiding skips windows that are minimized already or cannot minimize', () => {
    const windows = [
        { id: 1, minimized: false, canMinimize: true },
        { id: 2, minimized: true, canMinimize: true },
        { id: 3, minimized: false, canMinimize: false },
    ];
    assert.deepEqual(hideTargets(windows).map((w) => w.id), [1]);
    assert.deepEqual(hideTargets([]), []);
});

test('focusing a hidden app brings back only its own hidden windows that are still minimized', () => {
    const hidden = new Map([
        ['a1', 'editor'],
        ['a2', 'editor'],
        ['b1', 'browser'],
    ]);
    const minimized = new Set(['a1', 'b1']);
    assert.deepEqual(unhideTargets(hidden, 'editor', (w) => minimized.has(w)), ['a1']);
    assert.deepEqual(unhideTargets(hidden, 'terminal', () => true), []);
    assert.deepEqual(unhideTargets(hidden, null, () => true), []);
});
