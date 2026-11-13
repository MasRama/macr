import assert from 'node:assert/strict';
import { test } from 'node:test';

import { snapZone } from '../../src/features/tiling/logic/zones.js';

const one = { x: 0, y: 0, width: 1920, height: 1080 };
const at = (x: number, y: number, monitors = [one]) => snapZone({ x, y }, monitors);

test('the left and right edges tile a half', () => {
    assert.deepEqual(at(0, 500), { monitor: 0, placement: 'left' });
    assert.deepEqual(at(1919, 500), { monitor: 0, placement: 'right' });
});

test('the top edge fills the screen', () => {
    assert.deepEqual(at(960, 0), { monitor: 0, placement: 'fill' });
});

test('the corners tile a quarter, from either edge', () => {
    assert.deepEqual(at(0, 0), { monitor: 0, placement: 'top-left' });
    assert.deepEqual(at(0, 40), { monitor: 0, placement: 'top-left' });
    assert.deepEqual(at(40, 0), { monitor: 0, placement: 'top-left' });
    assert.deepEqual(at(1919, 0), { monitor: 0, placement: 'top-right' });
    assert.deepEqual(at(0, 1079), { monitor: 0, placement: 'bottom-left' });
    assert.deepEqual(at(1919, 1050), { monitor: 0, placement: 'bottom-right' });
    assert.deepEqual(at(1880, 1079), { monitor: 0, placement: 'bottom-right' });
});

test('the middle of the screen and the bottom edge do nothing', () => {
    assert.equal(at(960, 540), null);
    assert.equal(at(960, 1079), null);
    assert.equal(at(20, 500), null);
});

const second = { x: 1920, y: 0, width: 1920, height: 1080 };

test('edges where another monitor continues do not snap', () => {
    assert.equal(at(1919, 500, [one, second]), null);
    assert.equal(at(1920, 500, [one, second]), null);
    assert.deepEqual(at(3839, 500, [one, second]), { monitor: 1, placement: 'right' });
    assert.deepEqual(at(2500, 0, [one, second]), { monitor: 1, placement: 'fill' });
});

test('a corner on an open edge is just the top edge', () => {
    assert.deepEqual(at(1919, 0, [one, second]), { monitor: 0, placement: 'fill' });
    assert.deepEqual(at(0, 0, [one, second]), { monitor: 0, placement: 'top-left' });
});

test('an edge only part of which meets another monitor snaps where it does not', () => {
    const lower = { x: 1920, y: 360, width: 1280, height: 720 };
    assert.deepEqual(at(1919, 200, [one, lower]), { monitor: 0, placement: 'right' });
    assert.equal(at(1919, 500, [one, lower]), null);
});

test('a pointer outside every monitor snaps nowhere', () => {
    assert.equal(at(5000, 5000), null);
});
