import assert from 'node:assert/strict';
import { test } from 'node:test';

import { genieVertex, genieVertexToward } from '../../src/features/dock/logic/genie.js';

const win = { width: 800, height: 600 };
const icon = { x: 300, y: 900, width: 48, height: 48 };

test('progress 0 leaves the window as it is', () => {
    assert.deepEqual(genieVertex(0, 0, win, icon, 0), [0, 0]);
    assert.deepEqual(genieVertex(800, 600, win, icon, 0), [800, 600]);
    assert.deepEqual(genieVertex(200, 300, win, icon, 0), [200, 300]);
});

test('progress 1 squeezes the window into the icon', () => {
    assert.deepEqual(genieVertex(0, 0, win, icon, 1), [300, 900]);
    assert.deepEqual(genieVertex(800, 600, win, icon, 1), [348, 948]);
});

test('halfway the bottom is narrower than the top', () => {
    const [topLeft] = genieVertex(0, 0, win, icon, 0.5);
    const [topRight] = genieVertex(800, 0, win, icon, 0.5);
    const [bottomLeft] = genieVertex(0, 600, win, icon, 0.5);
    const [bottomRight] = genieVertex(800, 600, win, icon, 0.5);
    assert.ok(bottomRight - bottomLeft < topRight - topLeft);
});

test('rows keep their order at every step', () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        let last = -Infinity;
        for (let y = 0; y <= 600; y += 60) {
            const [, ny] = genieVertex(400, y, win, icon, p);
            assert.ok(ny >= last, `p ${p}: row ${y} moved above the previous one`);
            last = ny;
        }
    }
});

test('a bottom dock pours the window as before', () => {
    assert.deepEqual(genieVertexToward('bottom', 200, 300, win, icon, 0.4), genieVertex(200, 300, win, icon, 0.4));
});

test('a side dock squeezes the window into its icon at the end', () => {
    const right = { x: 1200, y: 250, width: 48, height: 48 };
    assert.deepEqual(genieVertexToward('right', 0, 0, win, right, 1), [1200, 250]);
    assert.deepEqual(genieVertexToward('right', 800, 600, win, right, 1), [1248, 298]);
    const left = { x: -500, y: 250, width: 48, height: 48 };
    assert.deepEqual(genieVertexToward('left', 0, 0, win, left, 1), [-500, 250]);
    assert.deepEqual(genieVertexToward('left', 800, 600, win, left, 1), [-452, 298]);
    assert.deepEqual(genieVertexToward('left', 300, 200, win, left, 0), [300, 200]);
});

test('halfway, the side nearest the dock is the narrowest', () => {
    const right = { x: 1200, y: 250, width: 48, height: 48 };
    const span = (x: number) => genieVertexToward('right', x, 600, win, right, 0.5)[1] - genieVertexToward('right', x, 0, win, right, 0.5)[1];
    assert.ok(span(800) < span(0));
    const left = { x: -500, y: 250, width: 48, height: 48 };
    const leftSpan = (x: number) => genieVertexToward('left', x, 600, win, left, 0.5)[1] - genieVertexToward('left', x, 0, win, left, 0.5)[1];
    assert.ok(leftSpan(0) < leftSpan(800));
});
