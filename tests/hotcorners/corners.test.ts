import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cornerBarriers, hotCorners } from '../../src/features/hotcorners/logic/corners.js';

const one = { x: 0, y: 0, width: 1920, height: 1080 };
const names = (corners: { monitor: number; corner: string; shared: boolean }[]) =>
    corners.map((c) => `${c.monitor}:${c.corner}${c.shared ? ' shared' : ''}`);

test('one monitor has four corners on its last pixels', () => {
    assert.deepEqual(hotCorners([one], 0), [
        { monitor: 0, corner: 'top-left', x: 0, y: 0, shared: false },
        { monitor: 0, corner: 'top-right', x: 1919, y: 0, shared: false },
        { monitor: 0, corner: 'bottom-left', x: 0, y: 1079, shared: false },
        { monitor: 0, corner: 'bottom-right', x: 1919, y: 1079, shared: false },
    ]);
});

test('a second monitor loses the corners where the two meet', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    assert.deepEqual(names(hotCorners([one, second], 0)), [
        '0:top-left', '0:top-right shared', '0:bottom-left', '0:bottom-right shared',
        '1:top-right', '1:bottom-right',
    ]);
});

test('a smaller monitor lower down keeps the corner the bigger one does not touch', () => {
    const second = { x: 1920, y: 360, width: 1280, height: 720 };
    // Above the second monitor the first one's top-right corner is still free;
    // the second one's left corners open onto the first.
    assert.deepEqual(names(hotCorners([one, second], 0)), [
        '0:top-left', '0:top-right', '0:bottom-left', '0:bottom-right shared',
        '1:top-right', '1:bottom-right',
    ]);
});

test('the primary laptop right of a taller monitor keeps its left corners', () => {
    // An external 1920×1080 monitor on the left, the primary laptop at 125 %.
    const external = { x: 0, y: 0, width: 1920, height: 1080 };
    const laptop = { x: 1920, y: 0, width: 1536, height: 864 };
    assert.deepEqual(names(hotCorners([laptop, external], 0)), [
        '0:top-left shared', '0:top-right', '0:bottom-left shared', '0:bottom-right',
        '1:top-left', '1:bottom-left', '1:bottom-right',
    ]);
});

test('a shared corner is held by a pressure wall on each edge, letting the pointer back in', () => {
    const laptop = { x: 1920, y: 0, width: 1536, height: 864 };
    assert.deepEqual(cornerBarriers('top-left', laptop, 32), [
        { x1: 1920, y1: 0, x2: 1920, y2: 32, allow: 'positive-x' },
        { x1: 1920, y1: 0, x2: 1952, y2: 0, allow: 'positive-y' },
    ]);
    assert.deepEqual(cornerBarriers('bottom-left', laptop, 32), [
        { x1: 1920, y1: 832, x2: 1920, y2: 864, allow: 'positive-x' },
        { x1: 1920, y1: 864, x2: 1952, y2: 864, allow: 'negative-y' },
    ]);
    assert.deepEqual(cornerBarriers('top-right', one, 32), [
        { x1: 1920, y1: 0, x2: 1920, y2: 32, allow: 'negative-x' },
        { x1: 1888, y1: 0, x2: 1920, y2: 0, allow: 'positive-y' },
    ]);
});
