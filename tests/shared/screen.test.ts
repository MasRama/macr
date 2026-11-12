import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runsOn, screenOf } from '../../src/shared/logic/screen.js';

test('the session mode tells desktop, lock and login screens apart', () => {
    assert.equal(screenOf({ isGreeter: false, isLocked: false }), 'desktop');
    assert.equal(screenOf({ isLocked: true }), 'lock');
    assert.equal(screenOf({ isGreeter: true, isLocked: false }), 'login');
});

test('modules run on the desktop only unless they say otherwise', () => {
    assert.equal(runsOn(undefined, 'desktop'), true);
    assert.equal(runsOn(undefined, 'lock'), false);
    assert.equal(runsOn(undefined, 'login'), false);
    assert.equal(runsOn(['desktop', 'lock'], 'lock'), true);
    assert.equal(runsOn(['login'], 'desktop'), false);
    assert.equal(runsOn(['login'], 'login'), true);
});
