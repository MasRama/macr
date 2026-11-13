import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dockLayout, growPivot, isSide, labelPlace, panelPlace, parseEdge } from '../../src/features/dock/logic/edge.js';

const monitor = { x: 1920, y: 0, width: 1920, height: 1080 };

test('the setting falls back to the bottom', () => {
    assert.equal(parseEdge('left'), 'left');
    assert.equal(parseEdge('right'), 'right');
    assert.equal(parseEdge('top'), 'bottom');
    assert.equal(parseEdge(''), 'bottom');
    assert.equal(isSide('bottom'), false);
    assert.equal(isSide('left'), true);
});

test('a bottom dock is centred above the bottom edge', () => {
    const layout = dockLayout('bottom', monitor, { width: 600, height: 70 }, 6);
    assert.deepEqual(layout.resting, { x: 2580, y: 1004, width: 600, height: 70 });
    assert.deepEqual(layout.actor, { x: 2580, y: 1004 });
    assert.deepEqual(layout.hit, { x: 0, y: 0, width: 600, height: 76 });
    assert.deepEqual(layout.strip, { x: 2580, y: 1079, width: 600, height: 1 });
    assert.deepEqual(layout.hidden, { x: 0, y: 80 });
});

test('Mission Control keeps its windows above a bottom dock only', () => {
    assert.equal(dockLayout('bottom', monitor, { width: 600, height: 70 }, 6).overviewSpace, 76);
    assert.equal(dockLayout('left', monitor, { width: 70, height: 600 }, 6).overviewSpace, 0);
    assert.equal(dockLayout('right', monitor, { width: 70, height: 600 }, 6).overviewSpace, 0);
});

test('a left dock is centred beside the left edge and hides past it', () => {
    const layout = dockLayout('left', monitor, { width: 70, height: 500 }, 6);
    assert.deepEqual(layout.resting, { x: 1926, y: 290, width: 70, height: 500 });
    assert.deepEqual(layout.actor, { x: 1920, y: 290 });
    assert.deepEqual(layout.shelf, { x: 6, y: 0 });
    assert.deepEqual(layout.hit, { x: 0, y: 0, width: 76, height: 500 });
    assert.deepEqual(layout.strip, { x: 1920, y: 290, width: 1, height: 500 });
    assert.deepEqual(layout.hidden, { x: -80, y: 0 });
});

test('a right dock is centred beside the right edge and hides past it', () => {
    const layout = dockLayout('right', monitor, { width: 70, height: 500 }, 6);
    assert.deepEqual(layout.resting, { x: 3764, y: 290, width: 70, height: 500 });
    assert.deepEqual(layout.actor, { x: 3764, y: 290 });
    assert.deepEqual(layout.shelf, { x: 0, y: 0 });
    assert.deepEqual(layout.hit, { x: 0, y: 0, width: 76, height: 500 });
    assert.deepEqual(layout.strip, { x: 3839, y: 290, width: 1, height: 500 });
    assert.deepEqual(layout.hidden, { x: 80, y: 0 });
});

test('icons grow away from the edge', () => {
    assert.deepEqual(growPivot('bottom'), [0.5, 1]);
    assert.deepEqual(growPivot('left'), [0, 0.5]);
    assert.deepEqual(growPivot('right'), [1, 0.5]);
});

const stage = { width: 1920, height: 1080 };
const label = { width: 80, height: 24 };

test('a label sits over a bottom dock icon, past its magnification', () => {
    assert.deepEqual(labelPlace('bottom', { x: 500, y: 1000, width: 60, height: 60 }, 30, label, 10, stage), { x: 490, y: 936 });
    assert.equal(labelPlace('bottom', { x: 0, y: 1000, width: 60, height: 60 }, 0, label, 10, stage).x, 0);
});

test('a label sits beside a side dock icon, kept on the screen', () => {
    assert.deepEqual(labelPlace('left', { x: 6, y: 300, width: 60, height: 60 }, 30, label, 10, stage), { x: 106, y: 318 });
    assert.deepEqual(labelPlace('right', { x: 1854, y: 300, width: 60, height: 60 }, 30, label, 10, stage), { x: 1734, y: 318 });
    assert.equal(labelPlace('left', { x: 6, y: 1070, width: 60, height: 60 }, 0, label, 10, stage).y, 1056);
});

test('a stack opens above a bottom dock icon and beside a side one', () => {
    const panel = { width: 400, height: 300 };
    const area = { width: 1920, height: 1080 };
    const bottom = panelPlace('bottom', { x: 1800, y: 1010, width: 60, height: 60 }, panel, area, 10, 8);
    assert.deepEqual(bottom, { x: 1512, y: 700, pivot: [(1830 - 1512) / 400, 1] });
    const left = panelPlace('left', { x: 6, y: 500, width: 60, height: 60 }, panel, area, 10, 8);
    assert.deepEqual(left, { x: 76, y: 380, pivot: [0, 0.5] });
    const right = panelPlace('right', { x: 1854, y: 20, width: 60, height: 60 }, panel, area, 10, 8);
    assert.deepEqual(right, { x: 1444, y: 8, pivot: [1, 42 / 300] });
});
