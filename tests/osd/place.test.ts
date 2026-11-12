import assert from 'node:assert/strict';
import { test } from 'node:test';

import { osdMargins } from '../../src/features/osd/logic/place.js';

const monitor = { x: 0, y: 0, width: 1920, height: 1080 };

test('sits just under the menu bar, at the right edge', () => {
    const workArea = { x: 0, y: 30, width: 1920, height: 1050 };
    assert.deepEqual(osdMargins(monitor, workArea, 10), { top: 40, right: 10 });
});

test('a monitor without a bar puts it at the top edge', () => {
    assert.deepEqual(osdMargins(monitor, monitor, 10), { top: 10, right: 10 });
});

test('works on a second monitor to the right', () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1440 };
    const workArea = { x: 1920, y: 40, width: 2560, height: 1400 };
    assert.deepEqual(osdMargins(second, workArea, 12), { top: 52, right: 12 });
});

test('keeps clear of a panel reserved on the right', () => {
    const workArea = { x: 0, y: 30, width: 1860, height: 1050 };
    assert.deepEqual(osdMargins(monitor, workArea, 10), { top: 40, right: 70 });
});

test('a work area that spills past the monitor never gives negative margins', () => {
    const workArea = { x: -5, y: -5, width: 2000, height: 1100 };
    assert.deepEqual(osdMargins(monitor, workArea, 10), { top: 10, right: 10 });
});
