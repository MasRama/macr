import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOCK_DATE_FORMAT, lockTimeFormat } from '../../src/features/lockscreen/logic/clock.js';
import { lockLayout, type LockSizes } from '../../src/features/lockscreen/logic/layout.js';

test('the lock time has no AM/PM, in either clock format', () => {
    assert.equal(lockTimeFormat(false), '%-l:%M');
    assert.equal(lockTimeFormat(true), '%H:%M');
    assert.equal(LOCK_DATE_FORMAT, '%A %-d %B');
});

const sizes: LockSizes = { clock: [600, 160], notifications: [400, 120], prompt: [300, 110], buttons: [80, 60] };

test('time near the top, user low in the middle, both centred', () => {
    const boxes = lockLayout(1920, 1080, sizes, 1);
    assert.deepEqual(boxes.clock, { x1: 660, y1: 76, x2: 1260, y2: 236 });
    assert.deepEqual(boxes.prompt, { x1: 810, y1: 756, x2: 1110, y2: 866 });
    assert.deepEqual(boxes.notifications, { x1: 760, y1: 260, x2: 1160, y2: 380 });
    assert.deepEqual(boxes.buttons, { x1: 1840, y1: 1020, x2: 1920, y2: 1080 });
});

test('the avatar stays put when the password field makes the prompt taller', () => {
    const idle = lockLayout(1920, 1080, { ...sizes, prompt: [300, 110] }, 1);
    const typing = lockLayout(1920, 1080, { ...sizes, prompt: [300, 230] }, 1);
    assert.equal(typing.prompt.y1, idle.prompt.y1);
});

test('a tall prompt on a short screen moves up to stay on screen', () => {
    const boxes = lockLayout(1280, 720, { ...sizes, prompt: [300, 260] }, 1);
    assert.ok(boxes.prompt.y2 <= 720 - Math.round(720 * 0.04));
});

test('notifications get only the room between the time and the user', () => {
    const boxes = lockLayout(1920, 1080, { ...sizes, notifications: [400, 2000] }, 1);
    assert.equal(boxes.notifications.y1, 260);
    assert.equal(boxes.notifications.y2, boxes.prompt.y1 - 24);
});

test('no login options button, no box for it', () => {
    assert.equal(lockLayout(1920, 1080, { ...sizes, buttons: null }, 1).buttons, null);
});
