import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loginLayout, type LoginSizes } from '../../src/features/loginscreen/logic/layout.js';

const sizes: LoginSizes = { clock: [600, 160], users: [400, 140], prompt: [290, 200] };

test('the time sits where the lock screen has it', () => {
    const boxes = loginLayout(1920, 1080, sizes, 1);
    assert.deepEqual(boxes.clock, { x1: 660, y1: 76, x2: 1260, y2: 236 });
});

test('users and prompt start at the same height, low in the middle', () => {
    const boxes = loginLayout(1920, 1080, sizes, 1);
    assert.equal(boxes.users.y1, 756);
    assert.equal(boxes.prompt.y1, boxes.users.y1);
    assert.equal(boxes.users.x1, 760);
    assert.equal(boxes.prompt.x1, 815);
});

test('a tall prompt on a short screen moves both up together', () => {
    const boxes = loginLayout(1280, 720, { ...sizes, prompt: [290, 300] }, 1);
    assert.ok(boxes.prompt.y2 <= 720 - Math.round(720 * 0.04));
    assert.equal(boxes.users.y1, boxes.prompt.y1);
});
