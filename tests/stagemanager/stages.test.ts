import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eligible, initialState, stages, step, type StageEvent, type StageState, type StageWindow, type World } from '../../src/features/stagemanager/logic/stages.js';

const w = (id: number, app: string, minimized = false): StageWindow => ({ id, app, minimized });

/** Applies a plan to the world, as the shell would. */
function apply(world: World, plan: ReturnType<typeof step>): World {
    const windows = world.windows.map((window) => {
        if (plan.minimize.includes(window.id)) return { ...window, minimized: true };
        if (plan.unminimize.includes(window.id)) return { ...window, minimized: false };
        return window;
    });
    return { windows, focus: plan.focus ?? world.focus };
}

function run(state: StageState, world: World, event: StageEvent) {
    const plan = step(state, world, event);
    return { plan, state: plan.state, world: apply(world, plan) };
}

/** A, B and C with one window each, focused A, Stage Manager just turned on. */
function started() {
    const world: World = { windows: [w(1, 'a'), w(2, 'b'), w(3, 'c')], focus: 1 };
    return run(initialState(), world, { type: 'enable' });
}

test('turning on keeps the focused app and minimizes the others into stages', () => {
    const { plan, state } = started();
    assert.equal(state.centre, 'a');
    assert.deepEqual(plan.minimize, [2, 3]);
    assert.deepEqual(plan.unminimize, []);
    assert.equal(plan.focus, null);
    assert.deepEqual(state.ours, [2, 3]);
});

test('windows the user minimized before turning on stay in the dock', () => {
    const world: World = { windows: [w(1, 'a'), w(2, 'b', true), w(3, 'c')], focus: 1 };
    const { plan, state, world: after } = run(initialState(), world, { type: 'enable' });
    assert.deepEqual(plan.minimize, [3]);
    assert.deepEqual(state.ours, [3]);
    assert.deepEqual(stages(state, after, 6).map((s) => s.app), ['c']);
});

test('turning on with nothing focused keeps the most recent showing app', () => {
    const world: World = { windows: [w(1, 'a'), w(2, 'b')], focus: null };
    const { state, plan } = run(initialState(), world, { type: 'enable' });
    assert.equal(state.centre, 'a');
    assert.deepEqual(plan.minimize, [2]);
});

test('stages are the other apps, most recent first, grouped by app', () => {
    const world: World = { windows: [w(1, 'a'), w(2, 'b'), w(4, 'b'), w(3, 'c')], focus: 1 };
    const { state, world: after } = run(initialState(), world, { type: 'enable' });
    assert.deepEqual(stages(state, after, 6), [
        { app: 'b', windows: [2, 4] },
        { app: 'c', windows: [3] },
    ]);
    assert.deepEqual(stages(state, after, 1), [{ app: 'b', windows: [2, 4] }], 'only as many as fit');
});

test('a stage shows at most three windows', () => {
    const world: World = { windows: [w(1, 'a'), w(2, 'b'), w(3, 'b'), w(4, 'b'), w(5, 'b')], focus: 1 };
    const { state, world: after } = run(initialState(), world, { type: 'enable' });
    assert.deepEqual(stages(state, after, 6), [{ app: 'b', windows: [2, 3, 4] }]);
});

test('selecting a stage brings it back first, then sends the centre to the strip', () => {
    let { state, world } = started();
    ({ state, world } = (() => {
        const r = run(state, world, { type: 'select', app: 'c' });
        assert.deepEqual(r.plan.unminimize, [3]);
        assert.equal(r.plan.focus, 3);
        assert.deepEqual(r.plan.minimize, [1]);
        return r;
    })());
    assert.equal(state.centre, 'c');
    assert.deepEqual(state.ours, [2, 1]);
    assert.deepEqual(stages(state, world, 6).map((s) => s.app), ['a', 'b'], 'the old centre is the most recent stage');
});

test('focusing a stage window from elsewhere swaps the same way', () => {
    const { state, world: start } = started();
    // Alt+Tab (or the dock, Mission Control) unminimizes and focuses b's window.
    const world = { windows: start.windows.map((x) => (x.id === 2 ? { ...x, minimized: false } : x)), focus: 2 };
    let r = run(state, world, { type: 'unminimized', window: 2 });
    assert.deepEqual(r.plan.unminimize, []);
    assert.deepEqual(r.plan.minimize, [1]);
    assert.equal(r.plan.focus, null, 'the focus is already where the user put it');
    r = run(r.state, r.world, { type: 'focus' });
    assert.deepEqual(r.plan.minimize, []);
    assert.deepEqual(r.plan.unminimize, []);
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.state.ours, [3, 1]);
});

test('focusing one window of a stage brings the whole stage back', () => {
    const world: World = { windows: [w(1, 'a'), w(2, 'b'), w(4, 'b')], focus: 1 };
    let r = run(initialState(), world, { type: 'enable' });
    r = run(r.state, { windows: r.world.windows.map((x) => (x.id === 4 ? { ...x, minimized: false } : x)), focus: 4 }, { type: 'focus' });
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.plan.unminimize, [2]);
    assert.deepEqual(r.plan.minimize, [1]);
});

test('a focus change inside the centre app changes nothing', () => {
    const world: World = { windows: [w(1, 'a'), w(5, 'a'), w(2, 'b')], focus: 1 };
    let r = run(initialState(), world, { type: 'enable' });
    r = run(r.state, { ...r.world, focus: 5 }, { type: 'focus' });
    assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null]);
    assert.equal(r.state.centre, 'a');
});

test('no focus, or focus on a window that is not eligible, keeps the centre', () => {
    const { state, world } = started();
    for (const focus of [null, 99]) {
        const r = run(state, { ...world, focus }, { type: 'focus' });
        assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
        assert.equal(r.state.centre, 'a');
    }
});

test('a user minimize of the centre sends it to the dock and promotes the latest stage', () => {
    const { state, world: start } = started();
    const world = { windows: start.windows.map((x) => (x.id === 1 ? { ...x, minimized: true } : x)), focus: null };
    const r = run(state, world, { type: 'minimized', window: 1 });
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.plan.unminimize, [2]);
    assert.equal(r.plan.focus, 2);
    assert.deepEqual(r.plan.minimize, []);
    assert.deepEqual(r.state.ours, [3], 'the minimized window is not a stage');
    assert.deepEqual(stages(r.state, r.world, 6).map((s) => s.app), ['c']);
    // Bringing it back from the dock makes it the centre again.
    const back = run(r.state, { windows: r.world.windows.map((x) => (x.id === 1 ? { ...x, minimized: false } : x)), focus: 1 }, { type: 'focus' });
    assert.equal(back.state.centre, 'a');
    assert.deepEqual(back.plan.minimize, [2]);
});

test('minimizing one of two centre windows keeps the centre', () => {
    const world: World = { windows: [w(1, 'a'), w(5, 'a'), w(2, 'b')], focus: 1 };
    let r = run(initialState(), world, { type: 'enable' });
    r = run(r.state, { windows: r.world.windows.map((x) => (x.id === 1 ? { ...x, minimized: true } : x)), focus: 5 }, { type: 'minimized', window: 1 });
    assert.equal(r.state.centre, 'a');
    assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null]);
});

test('minimizing the last centre window with no stages leaves the centre empty', () => {
    const world: World = { windows: [w(1, 'a')], focus: 1 };
    let r = run(initialState(), world, { type: 'enable' });
    r = run(r.state, { windows: [w(1, 'a', true)], focus: null }, { type: 'minimized', window: 1 });
    assert.equal(r.state.centre, null);
    assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null]);
});

test('closing the last centre window promotes the latest stage', () => {
    const { state, world } = started();
    const r = run(state, { windows: world.windows.filter((x) => x.id !== 1), focus: null }, { type: 'closed', window: 1 });
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.plan.unminimize, [2]);
    assert.equal(r.plan.focus, 2);
    assert.deepEqual(r.state.ours, [3]);
});

test('closing the last centre window promotes even when the focus change comes first', () => {
    const { state, world } = started();
    const gone = { windows: world.windows.filter((x) => x.id !== 1), focus: null };
    let r = run(state, gone, { type: 'focus' });
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
    r = run(r.state, r.world, { type: 'closed', window: 1 });
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.plan.unminimize, [2]);
    assert.equal(r.plan.focus, 2);
});

test('closing a centre window when another is left changes nothing', () => {
    const world: World = { windows: [w(1, 'a'), w(5, 'a'), w(2, 'b')], focus: 1 };
    let r = run(initialState(), world, { type: 'enable' });
    r = run(r.state, { windows: r.world.windows.filter((x) => x.id !== 1), focus: 5 }, { type: 'closed', window: 1 });
    assert.equal(r.state.centre, 'a');
    assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null]);
});

test('closing a stage window drops it', () => {
    const { state, world } = started();
    const r = run(state, { windows: world.windows.filter((x) => x.id !== 3), focus: 1 }, { type: 'closed', window: 3 });
    assert.deepEqual(r.state.ours, [2]);
    assert.deepEqual(stages(r.state, r.world, 6).map((s) => s.app), ['b']);
});

test('a focused new window of another app becomes the centre', () => {
    const { state, world } = started();
    const r = run(state, { windows: [w(4, 'd'), ...world.windows], focus: 4 }, { type: 'created', window: 4 });
    assert.equal(r.state.centre, 'd');
    assert.deepEqual(r.plan.minimize, [1]);
    assert.deepEqual(r.plan.unminimize, []);
});

test('an unfocused new window of another app goes to the strip', () => {
    const { state, world } = started();
    const r = run(state, { windows: [...world.windows, w(4, 'd')], focus: 1 }, { type: 'created', window: 4 });
    assert.equal(r.state.centre, 'a');
    assert.deepEqual(r.plan.minimize, [4]);
    assert.deepEqual(r.state.ours, [2, 3, 4]);
});

test('a new window of the centre app stays', () => {
    const { state, world } = started();
    const r = run(state, { windows: [...world.windows, w(4, 'a')], focus: 1 }, { type: 'created', window: 4 });
    assert.deepEqual(r.plan.minimize, []);
});

test('the first window after an empty centre becomes the centre', () => {
    let r = run(initialState(), { windows: [w(1, 'a')], focus: 1 }, { type: 'enable' });
    r = run(r.state, { windows: [w(1, 'a', true)], focus: null }, { type: 'minimized', window: 1 });
    r = run(r.state, { windows: [w(1, 'a', true), w(2, 'b')], focus: null }, { type: 'created', window: 2 });
    assert.equal(r.state.centre, 'b');
    assert.deepEqual(r.plan.minimize, []);
});

test('portal dialogs and other windows that are not eligible never count', () => {
    const base = { normal: true, skipTaskbar: false, onActiveWorkspace: true, sticky: false, above: false, transient: false, app: 'org.gnome.TextEditor.desktop' };
    assert.equal(eligible(base), true);
    assert.equal(eligible({ ...base, app: 'xdg-desktop-portal-gnome.desktop' }), false);
    assert.equal(eligible({ ...base, app: 'window:12', wmClass: 'xdg-desktop-portal-gnome' }), false);
    assert.equal(eligible({ ...base, app: 'window:12', wmClass: 'org.freedesktop.impl.portal.desktop.gtk' }), false);
    assert.equal(eligible({ ...base, transient: true }), false);
    assert.equal(eligible({ ...base, normal: false }), false);
    assert.equal(eligible({ ...base, skipTaskbar: true }), false);
    assert.equal(eligible({ ...base, onActiveWorkspace: false }), false);
    assert.equal(eligible({ ...base, sticky: true }), false);
    assert.equal(eligible({ ...base, above: true }), false);
    assert.equal(eligible({ ...base, app: null }), false);
});

test('focus on a portal dialog (left out of the world) keeps the centre', () => {
    const { state, world } = started();
    // The controller leaves the portal's window out; the focus points at nothing it knows.
    const r = run(state, { ...world, focus: 42 }, { type: 'focus' });
    assert.equal(r.state.centre, 'a');
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
});

test('turning off brings back every window it minimized, oldest first, and refocuses', () => {
    let { state, world } = started();
    ({ state, world } = run(state, world, { type: 'select', app: 'c' }));
    // A window on another workspace it minimized earlier is not in this world but is restored too.
    state = { ...state, ours: [7, ...state.ours] };
    const r = run(state, world, { type: 'disable' });
    assert.deepEqual(r.plan.unminimize, [7, 2, 1]);
    assert.equal(r.plan.focus, 3);
    assert.deepEqual(r.plan.minimize, []);
    assert.deepEqual(r.state.ours, []);
});

test('turning off leaves windows the user minimized alone', () => {
    let { state, world } = started();
    world = { windows: world.windows.map((x) => (x.id === 1 ? { ...x, minimized: true } : x)), focus: null };
    ({ state, world } = run(state, world, { type: 'minimized', window: 1 }));
    const r = run(state, world, { type: 'disable' });
    assert.deepEqual(r.plan.unminimize, [3]);
    assert.ok(!r.plan.unminimize.includes(1));
});

test('while paused nothing is minimized or brought back', () => {
    let { state, world } = started();
    ({ state, world } = run(state, world, { type: 'pause' }));
    assert.equal(state.paused, true);
    // Show Desktop minimizes the centre.
    world = { windows: world.windows.map((x) => ({ ...x, minimized: true })), focus: null };
    for (const event of [{ type: 'minimized', window: 1 }, { type: 'focus' }, { type: 'select', app: 'b' }, { type: 'created', window: 9 }] as StageEvent[]) {
        const r = run(state, world, event);
        assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null], event.type);
    }
});

test('Show Desktop sends the centre to the strip, and showing it again brings it back', () => {
    let { state, world } = started();
    ({ state, world } = run(state, world, { type: 'pause' }));
    world = { windows: world.windows.map((x) => ({ ...x, minimized: true })), focus: null };
    let r = run(state, world, { type: 'resume' });
    assert.equal(r.state.paused, false);
    assert.equal(r.state.centre, null);
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
    assert.deepEqual(stages(r.state, r.world, 6).map((s) => s.app), ['a', 'b', 'c']);
    // The hot corner again: paused, it brings back the windows it hid.
    r = run(r.state, r.world, { type: 'pause' });
    r = run(r.state, { windows: r.world.windows.map((x) => (x.id === 1 ? { ...x, minimized: false } : x)), focus: null }, { type: 'resume' });
    assert.equal(r.state.centre, 'a');
    assert.deepEqual(r.state.ours, [2, 3]);
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
});

test('lock and unlock (pause and resume) leave everything as it was', () => {
    let { state, world } = started();
    const before = state;
    ({ state, world } = run(state, world, { type: 'pause' }));
    const r = run(state, world, { type: 'resume' });
    assert.deepEqual([r.plan.minimize, r.plan.unminimize, r.plan.focus], [[], [], null]);
    assert.deepEqual({ ...r.state, mru: [] }, { ...before, mru: [] });
});

test('turning off while paused still restores', () => {
    let { state, world } = started();
    ({ state, world } = run(state, world, { type: 'pause' }));
    const r = run(state, world, { type: 'disable' });
    assert.deepEqual(r.plan.unminimize, [2, 3]);
});

test('someone else bringing back a window it minimized is not a stage any more', () => {
    const { state, world } = started();
    // e.g. an extension unminimizes c without focusing it: c becomes the centre.
    const r = run(state, { windows: world.windows.map((x) => (x.id === 3 ? { ...x, minimized: false } : x)), focus: 1 }, { type: 'unminimized', window: 3 });
    assert.equal(r.state.centre, 'c');
    assert.deepEqual(r.plan.minimize, [1]);
    assert.deepEqual(r.state.ours, [2, 1]);
});

test('a user unminimize of a window it does not own waits for the focus', () => {
    let r = run(initialState(), { windows: [w(1, 'a'), w(2, 'b', true)], focus: 1 }, { type: 'enable' });
    r = run(r.state, { windows: [w(1, 'a'), w(2, 'b')], focus: 1 }, { type: 'unminimized', window: 2 });
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
});

test('switching workspace settles the new one and keeps the other workspace\'s stages', () => {
    const { state } = started();
    const r = run(state, { windows: [w(10, 'x'), w(11, 'y')], focus: 11 }, { type: 'workspace' });
    assert.equal(r.state.centre, 'y');
    assert.deepEqual(r.plan.minimize, [10]);
    assert.deepEqual(r.state.ours, [2, 3, 10]);
    assert.deepEqual(stages(r.state, r.world, 6).map((s) => s.app), ['x']);
});

test('a centre window that stops being eligible lets the focus decide again', () => {
    const { state, world } = started();
    // a's window moved to the other monitor; focus stays on it (not in the world).
    const r = run(state, { windows: world.windows.filter((x) => x.id !== 1), focus: 1 }, { type: 'focus' });
    assert.deepEqual([r.plan.minimize, r.plan.unminimize], [[], []]);
    assert.deepEqual(stages(r.state, r.world, 6).map((s) => s.app), ['b', 'c']);
});
