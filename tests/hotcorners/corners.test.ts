import assert from 'node:assert/strict';
import { test } from 'node:test';

import { outerCorners } from '../../src/features/hotcorners/logic/corners.js';
import { toggleDesktop } from '../../src/features/hotcorners/logic/desktop.js';

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

test('show desktop hides every window still showing', () => {
    const plan = toggleDesktop([{ id: 1, minimized: false }, { id: 2, minimized: true }, { id: 3, minimized: false }], []);
    assert.deepEqual(plan, { minimize: [1, 3], restore: [], hidden: [1, 3] });
});

test('show desktop again brings back only the windows it hid', () => {
    const plan = toggleDesktop([{ id: 1, minimized: true }, { id: 2, minimized: true }, { id: 3, minimized: true }], [1, 3]);
    assert.deepEqual(plan, { minimize: [], restore: [1, 3], hidden: [] });
});

test('windows closed meanwhile are forgotten', () => {
    const plan = toggleDesktop([{ id: 3, minimized: true }], [1, 3]);
    assert.deepEqual(plan, { minimize: [], restore: [3], hidden: [] });
});

test('nothing to hide or bring back does nothing', () => {
    assert.deepEqual(toggleDesktop([], []), { minimize: [], restore: [], hidden: [] });
});
