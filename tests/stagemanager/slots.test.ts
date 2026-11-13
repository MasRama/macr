import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitPreview, stripLayout } from '../../src/features/stagemanager/logic/slots.js';

const full = { x: 0, y: 32, width: 1920, height: 1048 };
const small = { x: 0, y: 28, width: 1280, height: 692 };

test('a 1080p screen fits six stages, a small one fewer', () => {
    assert.equal(stripLayout(full, 0).capacity, 6);
    const capacity = stripLayout(small, 0).capacity;
    assert.ok(capacity >= 4 && capacity < 6, `small screen fits ${capacity}`);
});

test('slots are stacked down the left edge, centred vertically, inside the work area', () => {
    const layout = stripLayout(full, 3);
    assert.equal(layout.slots.length, 3);
    for (const slot of layout.slots) {
        assert.ok(slot.x > full.x && slot.x + slot.width < full.x + layout.width);
        assert.ok(slot.y >= full.y && slot.y + slot.height <= full.y + full.height);
    }
    for (let i = 1; i < 3; i++) assert.ok(layout.slots[i].y > layout.slots[i - 1].y + layout.slots[i - 1].height, 'a gap between slots');
    const top = layout.slots[0].y - full.y;
    const bottom = full.y + full.height - (layout.slots[2].y + layout.slots[2].height);
    assert.ok(Math.abs(top - bottom) <= 1, 'centred');
});

test('never more slots than fit', () => {
    assert.equal(stripLayout(full, 20).slots.length, 6);
});

test('the strip follows the monitor it is on', () => {
    const area = { x: 1920, y: 0, width: 1920, height: 1080 };
    const layout = stripLayout(area, 1);
    assert.ok(layout.slots[0].x > 1920);
});

test('a preview keeps its aspect ratio inside its slot, aligned left and centred vertically', () => {
    const slot = { x: 18, y: 100, width: 160, height: 120 };
    assert.deepEqual(fitPreview({ width: 1600, height: 800 }, slot), { x: 18, y: 120, width: 160, height: 80 });
    assert.deepEqual(fitPreview({ width: 600, height: 1200 }, slot), { x: 18, y: 100, width: 60, height: 120 });
    assert.deepEqual(fitPreview({ width: 0, height: 0 }, slot), slot);
});
