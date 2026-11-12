import assert from 'node:assert/strict';
import { test } from 'node:test';

import { magnify } from '../../src/features/dock/logic/magnify.js';

const width = 48;
const centers = [24, 72, 120, 168, 216];
const opts = { maxScale: 1.6, reach: 2.5 };

test('no pointer leaves every icon at rest', () => {
    const m = magnify(centers, width, null, opts);
    assert.deepEqual(m.scales, [1, 1, 1, 1, 1]);
    assert.deepEqual(m.shifts, [0, 0, 0, 0, 0]);
    assert.equal(m.extra, 0);
    assert.equal(m.extraLeft, 0);
});

test('the icon under the pointer gets the full scale and stays in place', () => {
    const m = magnify(centers, width, 120, opts);
    assert.equal(m.scales[2], 1.6);
    assert.ok(Math.abs(m.shifts[2]) < 1e-9);
    assert.ok(Math.abs(m.scales[1] - m.scales[3]) < 1e-9, 'neighbours are symmetric');
    assert.ok(m.scales[1] > m.scales[0]);
});

test('icons beyond the reach keep their size', () => {
    const m = magnify([24, 72, 120, 168, 216, 400], width, 24, opts);
    assert.equal(m.scales[5], 1);
});

test('neighbours move apart instead of overlapping', () => {
    for (const pointer of [10, 50, 96, 121, 200, 230]) {
        const m = magnify(centers, width, pointer, opts);
        for (let i = 0; i + 1 < centers.length; i++) {
            const rightEdge = centers[i] + m.shifts[i] + (m.scales[i] * width) / 2;
            const nextLeftEdge = centers[i + 1] + m.shifts[i + 1] - (m.scales[i + 1] * width) / 2;
            assert.ok(rightEdge <= nextLeftEdge + 1e-6, `pointer ${pointer}: icon ${i} overlaps ${i + 1}`);
        }
    }
    const middle = magnify(centers, width, 120, opts);
    assert.ok(middle.shifts[0] < 0 && middle.shifts[4] > 0, 'outer icons move outwards');
});

test('the extra width is the sum of every icon growth', () => {
    const m = magnify(centers, width, 100, opts);
    const growth = m.scales.reduce((sum: number, s: number) => sum + (s - 1) * width, 0);
    assert.ok(Math.abs(m.extra - growth) < 1e-9);
    assert.ok(m.extraLeft > 0 && m.extraLeft < m.extra);
});

test('fixed items such as separators keep their size but still make room', () => {
    const fixed = [false, false, true, false, false];
    const m = magnify(centers, width, 72, { ...opts, fixed });
    assert.equal(m.scales[2], 1);
    assert.ok(m.shifts[2] > 0, 'the separator moves away from the pointer');
    const growth = m.scales.reduce((sum: number, s: number, i: number) => sum + (fixed[i] ? 0 : (s - 1) * width), 0);
    assert.ok(Math.abs(m.extra - growth) < 1e-9);
});
