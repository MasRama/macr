import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeTarget, keptCount, takeOver } from '../../src/features/missioncontrol/logic/spaces.js';

test('fixed Spaces keep the desktops in use, without GNOME’s trailing empty one', () => {
    assert.equal(keptCount(2, true), 1);
    assert.equal(keptCount(4, false), 4);
    assert.equal(keptCount(1, true), 1);
});

test('a closed Space sends its windows to the one on its left, or the right for the first', () => {
    assert.equal(closeTarget(2, 3), 1);
    assert.equal(closeTarget(0, 3), 1);
    assert.equal(closeTarget(0, 1), -1);
});

test('dynamic workspaces are turned off once, and remembered only when Macr turned them off', () => {
    assert.deepEqual(takeOver(true, false), { save: true, switchOff: true });
    // Fixed already, by the user: nothing to put back later.
    assert.deepEqual(takeOver(false, false), { save: false, switchOff: false });
    // Left over from a session that ended with Macr on: the first originals stay.
    assert.deepEqual(takeOver(false, true), { save: false, switchOff: false });
    assert.deepEqual(takeOver(true, true), { save: false, switchOff: true });
});
