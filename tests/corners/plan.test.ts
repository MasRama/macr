import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cornerPlan, type WindowShape } from '../../src/features/corners/logic/plan.js';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const frameless: WindowShape = {
    kind: 'normal',
    buffer: rect(100, 100, 800, 600),
    frame: rect(100, 100, 800, 600),
    serverDecorated: false,
    maximized: false,
    fullscreen: false,
};

test('a frameless window (Electron, Chrome) is rounded and gets a shadow', () => {
    assert.deepEqual(cornerPlan(frameless, 16), { round: true, shadow: true, bounds: [0, 0, 800, 600], radius: 16 });
});

test('a server-decorated window is rounded inside its invisible borders, keeping its own shadow', () => {
    const x11 = { ...frameless, serverDecorated: true, buffer: rect(90, 90, 820, 620) };
    assert.deepEqual(cornerPlan(x11, 16), { round: true, shadow: false, bounds: [10, 10, 810, 610], radius: 16 });
});

test('a client-decorated window with its own shadow margin is left alone', () => {
    const gtk = { ...frameless, buffer: rect(70, 70, 860, 660) };
    assert.equal(cornerPlan(gtk, 16).round, false);
});

test('maximized, tiled and full-screen windows keep square corners', () => {
    assert.equal(cornerPlan({ ...frameless, maximized: true }, 16).round, false);
    assert.equal(cornerPlan({ ...frameless, fullscreen: true }, 16).round, false);
});

test('menus, tooltips and docks are never rounded', () => {
    assert.equal(cornerPlan({ ...frameless, kind: 'other' }, 16).round, false);
});

test('dialogs are rounded like windows', () => {
    assert.equal(cornerPlan({ ...frameless, kind: 'dialog' }, 16).round, true);
});

test('the radius never exceeds half the window', () => {
    const tiny = { ...frameless, buffer: rect(0, 0, 20, 40), frame: rect(0, 0, 20, 40) };
    assert.equal(cornerPlan(tiny, 16).radius, 10);
});

test('a zero radius turns rounding off', () => {
    assert.equal(cornerPlan(frameless, 0).round, false);
});
