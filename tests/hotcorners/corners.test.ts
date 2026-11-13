import assert from 'node:assert/strict';
import { test } from 'node:test';

import { outerCorners } from '../../src/features/hotcorners/logic/corners.js';

const one = { x: 0, y: 0, width: 1920, height: 1080 };

test('one monitor has four corners on its last pixels', () => {
    assert.deepEqual(outerCorners([one]), [
        { monitor: 0, corner: 'top-left', x: 0, y: 0 },
        { monitor: 0, corner: 'top-right', x: 1919, y: 0 },
        { monitor: 0, corner: 'bottom-left', x: 0, y: 1079 },
        { monitor: 0, corner: 'bottom-right', x: 1919, y: 1079 },
    ]);
});

test('two monitors side by side lose the corners where they meet', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    const corners = outerCorners([one, second]).map((c) => `${c.monitor}:${c.corner}`);
    assert.deepEqual(corners, ['0:top-left', '0:bottom-left', '1:top-right', '1:bottom-right']);
});

test('a smaller monitor lower down keeps the corner the bigger one does not touch', () => {
    const second = { x: 1920, y: 360, width: 1280, height: 720 };
    const corners = outerCorners([one, second]).map((c) => `${c.monitor}:${c.corner}`);
    // Above the second monitor the first one's top-right corner is still free;
    // the second one's left corners open onto the first.
    assert.deepEqual(corners, ['0:top-left', '0:top-right', '0:bottom-left', '1:top-right', '1:bottom-right']);
});
