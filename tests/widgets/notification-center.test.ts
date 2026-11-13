import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stackWidgets } from '../../src/features/widgets/logic/notification-center.js';

const small = { width: 10, height: 10 };
const medium = { width: 22, height: 10 };
const large = { width: 22, height: 22 };

test('small widgets go two to a row, under the notifications, as in macOS’s Notification Center', () => {
    assert.deepEqual(stackWidgets([small, small, small], 2, 22), {
        points: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 0, y: 12 }],
        size: { width: 22, height: 22 },
    });
});

test('medium and large widgets take a whole row, in order', () => {
    assert.deepEqual(stackWidgets([small, medium, large], 2, 22), {
        points: [{ x: 0, y: 0 }, { x: 0, y: 12 }, { x: 0, y: 24 }],
        size: { width: 22, height: 46 },
    });
});

test('no widgets take no room', () => {
    assert.deepEqual(stackWidgets([], 2, 22), { points: [], size: { width: 0, height: 0 } });
});
