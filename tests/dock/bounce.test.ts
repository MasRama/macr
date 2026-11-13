import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ATTENTION_BOUNCES, bounceOffset, bounceShift, keepBouncing, LAUNCH_LIMIT } from '../../src/features/dock/logic/bounce.js';

test('a bounce rises to its height halfway and lands at the end', () => {
    assert.equal(bounceOffset(0, 24), 0);
    assert.equal(bounceOffset(0.5, 24), 24);
    assert.equal(bounceOffset(1, 24), 0);
    assert.equal(bounceOffset(0.25, 24), 18);
    assert.equal(bounceOffset(0.25, 24), bounceOffset(0.75, 24));
});

test('progress outside a bounce stays on the shelf', () => {
    assert.equal(bounceOffset(-0.2, 24), 0);
    assert.equal(bounceOffset(1.3, 24), 0);
});

test('icons bounce away from the edge the dock sits on', () => {
    assert.deepEqual(bounceShift('bottom', 10), [0, -10]);
    assert.deepEqual(bounceShift('left', 10), [10, 0]);
    assert.deepEqual(bounceShift('right', 10), [-10, 0]);
});

test('an opening app bounces until it has opened', () => {
    assert.equal(keepBouncing({ kind: 'launch', done: 4, elapsed: 2560, starting: true }), true);
    assert.equal(keepBouncing({ kind: 'launch', done: 1, elapsed: 640, starting: false }), false);
});

test('an app that never opens stops bouncing after the limit', () => {
    assert.equal(keepBouncing({ kind: 'launch', done: 30, elapsed: LAUNCH_LIMIT, starting: true }), false);
    assert.equal(keepBouncing({ kind: 'launch', done: 18, elapsed: LAUNCH_LIMIT - 1, starting: true }), true);
});

test('an app asking for attention bounces a set number of times', () => {
    assert.equal(keepBouncing({ kind: 'attention', done: ATTENTION_BOUNCES - 1, elapsed: 0, starting: false }), true);
    assert.equal(keepBouncing({ kind: 'attention', done: ATTENTION_BOUNCES, elapsed: 0, starting: false }), false);
});
