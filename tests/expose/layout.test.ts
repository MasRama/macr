import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutWindows } from '../../src/features/expose/logic/layout.js';

const area = { x: 0, y: 0, width: 1000, height: 800 };

const inside = (r: { x: number; y: number; width: number; height: number }) =>
    r.x >= area.x - 1e-6 && r.y >= area.y - 1e-6 && r.x + r.width <= area.x + area.width + 1e-6 && r.y + r.height <= area.y + area.height + 1e-6;

test('no windows, no slots', () => {
    assert.deepEqual(layoutWindows([], area, 20), []);
});

test('one small window keeps its size and sits in the middle', () => {
    const [slot] = layoutWindows([{ width: 400, height: 300 }], area, 20);
    assert.deepEqual(slot, { x: 300, y: 250, width: 400, height: 300 });
});

test('a big window shrinks to fit, keeping its shape', () => {
    const [slot] = layoutWindows([{ width: 2000, height: 1000 }], area, 20);
    assert.ok(inside(slot));
    assert.equal(slot.width, 1000);
    assert.equal(slot.height, 500);
});

test('four equal windows go in two rows of two, in order', () => {
    const slots = layoutWindows(Array.from({ length: 4 }, () => ({ width: 800, height: 600 })), area, 20);
    assert.equal(slots.length, 4);
    for (const slot of slots) assert.ok(inside(slot));
    assert.equal(slots[0].y, slots[1].y);
    assert.equal(slots[2].y, slots[3].y);
    assert.ok(slots[2].y > slots[0].y);
    assert.ok(slots[0].x < slots[1].x && slots[2].x < slots[3].x);
    // Gaps are kept.
    assert.ok(slots[1].x - (slots[0].x + slots[0].width) >= 20 - 1e-6);
    assert.ok(slots[2].y - (slots[0].y + slots[0].height) >= 20 - 1e-6);
});

test('every window gets the same scale', () => {
    const sizes = [{ width: 800, height: 600 }, { width: 400, height: 600 }, { width: 1200, height: 900 }];
    const slots = layoutWindows(sizes, area, 20);
    const scales = slots.map((slot, i) => slot.width / sizes[i].width);
    for (const scale of scales) assert.ok(Math.abs(scale - scales[0]) < 1e-9);
    for (const slot of slots) assert.ok(inside(slot));
});
