import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stackViews } from '../../src/features/notifications/logic/stacks.js';

test('one notification per app stays as it is', () => {
    assert.deepEqual(stackViews(['mail', 'chat'], new Set()), [
        { index: 0, shown: true, stack: 'none', top: true, count: 1 },
        { index: 1, shown: true, stack: 'none', top: true, count: 1 },
    ]);
});

test("an app's notifications stack under its newest one, closed", () => {
    const views = stackViews(['chat', 'mail', 'chat', 'calendar', 'mail', 'chat'], new Set());
    // The chat stack first, then mail, then calendar, each where its newest was.
    assert.deepEqual(
        views.map((view) => view.index),
        [0, 3, 1, 5, 4, 2],
    );
    assert.deepEqual(
        views.map((view) => view.shown),
        [true, true, false, true, false, false],
    );
    assert.deepEqual(views[0], { index: 0, shown: true, stack: 'closed', top: true, count: 3 });
    assert.deepEqual(views[4], { index: 4, shown: false, stack: 'closed', top: false, count: 2 });
    assert.equal(views[3].stack, 'none');
});

test('an open stack shows all its notifications', () => {
    const views = stackViews(['chat', 'mail', 'chat'], new Set(['chat']));
    assert.deepEqual(
        views.map((view) => [view.index, view.shown, view.stack, view.top]),
        [
            [0, true, 'open', true],
            [2, true, 'none', true],
            [1, true, 'open', false],
        ],
    );
});

test('nothing to show gives nothing', () => {
    assert.deepEqual(stackViews([], new Set()), []);
});
