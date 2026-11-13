import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRIFT_STEPS, driftAt, saverDelay } from '../../src/features/screensaver/logic/screensaver.js';

test('the screen saver starts after the chosen minutes', () => {
    assert.equal(saverDelay(5, 0), 300);
    assert.equal(saverDelay(1, 0), 60);
});

test('it starts before GNOME blanks the screen, so it is seen at all', () => {
    // Blank after 5 minutes: a 10-minute saver starts a minute before.
    assert.equal(saverDelay(10, 300), 240);
    assert.equal(saverDelay(5, 300), 240);
    // Earlier than the blank already: unchanged.
    assert.equal(saverDelay(2, 300), 120);
    // A blank within a minute leaves half of it.
    assert.equal(saverDelay(5, 60), 30);
});

test('the wallpaper drifts without ever showing its edges', () => {
    for (let step = 0; step < DRIFT_STEPS * 2; step++) {
        const { scale, x, y } = driftAt(step);
        assert.ok(scale > 1, `step ${step} zooms in`);
        const room = (scale - 1) / 2;
        assert.ok(Math.abs(x) <= room && Math.abs(y) <= room, `step ${step} stays inside`);
    }
});

test('each move goes somewhere new, and the moves repeat', () => {
    for (let step = 0; step < DRIFT_STEPS; step++) {
        const a = driftAt(step);
        const b = driftAt(step + 1);
        assert.ok(a.x !== b.x || a.y !== b.y || a.scale !== b.scale, `step ${step} moves`);
    }
    assert.deepEqual(driftAt(DRIFT_STEPS + 2), driftAt(2));
});
