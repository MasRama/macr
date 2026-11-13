import assert from 'node:assert/strict';
import { test } from 'node:test';

import { placeWindow, reanchor, sameRect } from '../../src/shared/logic/geometry.js';

const area = { x: 0, y: 28, width: 1535, height: 836 };
const current = { x: 100, y: 100, width: 800, height: 500 };

test('left and right halves share the work area without a gap', () => {
    const left = placeWindow('left', area, current);
    const right = placeWindow('right', area, current);
    assert.deepEqual(left, { x: 0, y: 28, width: 767, height: 836 });
    assert.deepEqual(right, { x: 767, y: 28, width: 768, height: 836 });
});

test('fill takes the whole work area', () => {
    assert.deepEqual(placeWindow('fill', area, current), area);
});

test('center keeps the size and centres it', () => {
    assert.deepEqual(placeWindow('center', area, current), { x: 367, y: 196, width: 800, height: 500 });
});

test('center shrinks a window bigger than the work area', () => {
    assert.deepEqual(placeWindow('center', area, { x: 0, y: 0, width: 2000, height: 1000 }), area);
});

test('top and bottom halves split the height', () => {
    assert.deepEqual(placeWindow('top', area, current), { x: 0, y: 28, width: 1535, height: 418 });
    assert.deepEqual(placeWindow('bottom', area, current), { x: 0, y: 446, width: 1535, height: 418 });
});

test('quarters take a half of each side', () => {
    assert.deepEqual(placeWindow('top-left', area, current), { x: 0, y: 28, width: 767, height: 418 });
    assert.deepEqual(placeWindow('top-right', area, current), { x: 767, y: 28, width: 768, height: 418 });
    assert.deepEqual(placeWindow('bottom-left', area, current), { x: 0, y: 446, width: 767, height: 418 });
    assert.deepEqual(placeWindow('bottom-right', area, current), { x: 767, y: 446, width: 768, height: 418 });
});

const screen = { x: 0, y: 32, width: 1920, height: 1048 };

test('a gap keeps tiles off the work area edges and apart from each other', () => {
    const left = placeWindow('left', screen, current, 8);
    const right = placeWindow('right', screen, current, 8);
    assert.deepEqual(left, { x: 8, y: 40, width: 948, height: 1032 });
    assert.deepEqual(right, { x: 964, y: 40, width: 948, height: 1032 });
    // Two tiles are one gap apart; the outer edges are one gap in.
    assert.equal(right.x - (left.x + left.width), 8);
    assert.equal(screen.x + screen.width - (right.x + right.width), 8);
});

test('a gap insets fill on every side', () => {
    assert.deepEqual(placeWindow('fill', screen, current, 8), { x: 8, y: 40, width: 1904, height: 1032 });
});

test('quarters with a gap are one gap apart both ways', () => {
    const topLeft = placeWindow('top-left', screen, current, 8);
    const bottomRight = placeWindow('bottom-right', screen, current, 8);
    assert.deepEqual(topLeft, { x: 8, y: 40, width: 948, height: 512 });
    assert.deepEqual(bottomRight, { x: 964, y: 560, width: 948, height: 512 });
    assert.equal(bottomRight.y - (topLeft.y + topLeft.height), 8);
});

test('an odd gap still leaves exactly that much between tiles', () => {
    const left = placeWindow('left', screen, current, 5);
    const right = placeWindow('right', screen, current, 5);
    assert.equal(right.x - (left.x + left.width), 5);
    assert.equal(left.x, 5);
    assert.equal(screen.x + screen.width - (right.x + right.width), 5);
});

test('center with a gap keeps the window inside the inset area', () => {
    const big = { x: 0, y: 0, width: 3000, height: 3000 };
    assert.deepEqual(placeWindow('center', screen, big, 8), { x: 8, y: 40, width: 1904, height: 1032 });
});

test('a window that stayed wider than its right tile moves back onto the screen', () => {
    const tile = placeWindow('right', screen, current, 8);
    const frame = { ...tile, width: 1100 };
    assert.deepEqual(reanchor('right', tile, frame, screen), { x: 812, y: 40, width: 1100, height: 1032 });
});

test('a left tile that came out too wide keeps its left edge', () => {
    const tile = placeWindow('left', screen, current, 8);
    const frame = { ...tile, width: 1100 };
    assert.deepEqual(reanchor('left', tile, frame, screen), { ...tile, width: 1100 });
});

test('a bottom tile that came out too tall grows upwards', () => {
    const tile = placeWindow('bottom-right', screen, current, 8);
    const frame = { ...tile, width: 1000, height: 700 };
    assert.deepEqual(reanchor('bottom-right', tile, frame, screen), { x: 912, y: 372, width: 1000, height: 700 });
});

test('a window bigger than the work area is pinned to its top left', () => {
    const tile = placeWindow('right', screen, current, 8);
    const frame = { ...tile, width: 2500, height: 1200 };
    const fixed = reanchor('right', tile, frame, screen);
    assert.equal(fixed.x, screen.x);
    assert.equal(fixed.y, screen.y);
});

test('rects within a pixel count as the same', () => {
    assert.equal(sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 1, y: 0, width: 9, height: 11 }), true);
    assert.equal(sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 2, y: 0, width: 10, height: 10 }), false);
});
