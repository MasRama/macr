import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitInSquare, minimizedByDock } from '../../src/features/dock/logic/minimized.js';

test('each minimized window goes to the dock on its monitor, oldest first', () => {
    const windows = [
        { id: 1, monitor: 0, order: 3 },
        { id: 2, monitor: 1, order: 1 },
        { id: 3, monitor: 0, order: 2 },
    ];
    const byDock = minimizedByDock(windows, [0, 1], 0);
    assert.deepEqual(byDock.get(0), [3, 1]);
    assert.deepEqual(byDock.get(1), [2]);
});

test('a monitor without a dock sends its windows to the primary dock', () => {
    const byDock = minimizedByDock([{ id: 7, monitor: 1, order: 0 }], [0], 0);
    assert.deepEqual(byDock.get(0), [7]);
});

test('with the primary dock gone the first dock takes them', () => {
    const byDock = minimizedByDock([{ id: 7, monitor: 2, order: 0 }], [1], 0);
    assert.deepEqual(byDock.get(1), [7]);
    assert.equal(minimizedByDock([{ id: 7, monitor: 0, order: 0 }], [], 0).size, 0);
});

test('windows waiting in the Stage Manager strip stay out of the dock', () => {
    const windows = [
        { id: 1, monitor: 0, order: 1, staged: true },
        { id: 2, monitor: 0, order: 2, staged: false },
        { id: 3, monitor: 0, order: 3 },
    ];
    assert.deepEqual(minimizedByDock(windows, [0], 0).get(0), [2, 3]);
});

test('a thumbnail keeps the window’s shape inside the icon square', () => {
    assert.deepEqual(fitInSquare(1600, 900, 48), { width: 48, height: 27 });
    assert.deepEqual(fitInSquare(600, 800, 48), { width: 36, height: 48 });
    assert.deepEqual(fitInSquare(0, 0, 48), { width: 48, height: 48 });
});
