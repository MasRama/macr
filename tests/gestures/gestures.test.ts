import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    endsOpen,
    openness,
    pinchAction,
    pinchDirection,
    pinchProgress,
    swipeAction,
    swipeDirection,
    swipeProgress,
} from '../../src/features/gestures/logic/gestures.js';

const none = { launchpad: false, desktop: false, expose: false };

test('a pinch counts once the scale moved a little', () => {
    assert.equal(pinchDirection(1.02), null);
    assert.equal(pinchDirection(0.9), 'in');
    assert.equal(pinchDirection(1.1), 'out');
});

test('pinch progress follows the scale and stops at the ends', () => {
    assert.equal(pinchProgress('in', 1), 0);
    assert.ok(Math.abs(pinchProgress('in', 0.775) - 0.5) < 1e-9);
    assert.equal(pinchProgress('in', 0.2), 1);
    assert.ok(Math.abs(pinchProgress('out', 1.4) - 0.5) < 1e-9);
    assert.equal(pinchProgress('out', 0.9), 0);
});

test('a swipe counts once the fingers moved, and only up or down', () => {
    assert.equal(swipeDirection(3, 5), null);
    assert.equal(swipeDirection(2, 30), 'down');
    assert.equal(swipeDirection(2, -30), 'up');
    assert.equal(swipeDirection(40, 10), 'sideways');
});

test('swipe progress follows the fingers in the swipe direction', () => {
    assert.equal(swipeProgress('down', 150), 0.5);
    assert.equal(swipeProgress('down', -50), 0);
    assert.equal(swipeProgress('up', -600), 1);
});

test('a pinch opens Launchpad, a spread shows the desktop', () => {
    assert.deepEqual(pinchAction('in', none), { target: 'launchpad', opening: true });
    assert.deepEqual(pinchAction('out', none), { target: 'desktop', opening: true });
});

test('the opposite gesture closes what is open', () => {
    assert.deepEqual(pinchAction('out', { ...none, launchpad: true }), { target: 'launchpad', opening: false });
    assert.deepEqual(pinchAction('in', { ...none, desktop: true }), { target: 'desktop', opening: false });
    assert.equal(pinchAction('in', { ...none, launchpad: true }), null);
    assert.equal(pinchAction('out', { ...none, desktop: true }), null);
    assert.equal(pinchAction('in', { ...none, expose: true }), null);
});

test('swiping down opens App Exposé and up closes it', () => {
    assert.deepEqual(swipeAction('down', none), { target: 'expose', opening: true });
    assert.deepEqual(swipeAction('up', { ...none, expose: true }), { target: 'expose', opening: false });
    assert.equal(swipeAction('up', none), null);
    assert.equal(swipeAction('down', { ...none, launchpad: true }), null);
});

test('the target follows the fingers both ways', () => {
    assert.equal(openness({ target: 'launchpad', opening: true }, 0.3), 0.3);
    assert.equal(openness({ target: 'launchpad', opening: false }, 0.3), 0.7);
});

test('lifting the fingers past a quarter finishes, short of it springs back', () => {
    const open = { target: 'launchpad' as const, opening: true };
    const close = { target: 'launchpad' as const, opening: false };
    assert.equal(endsOpen(open, 0.3, false), true);
    assert.equal(endsOpen(open, 0.1, false), false);
    assert.equal(endsOpen(close, 0.3, false), false);
    assert.equal(endsOpen(close, 0.1, false), true);
    assert.equal(endsOpen(open, 0.9, true), false);
    assert.equal(endsOpen(close, 0.9, true), true);
});
