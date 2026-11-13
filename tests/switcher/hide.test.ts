import assert from 'node:assert/strict';
import { test } from 'node:test';

import { afterHide } from '../../src/features/switcher/logic/hide.js';

test('hiding an app in the switcher moves on to the next app, so letting go does not bring it back', () => {
    assert.equal(afterHide(0, ['files', 'text', 'web']), 1);
    assert.equal(afterHide(2, ['files', 'text', 'web']), 0);
});

test('in the window switcher, the hidden app’s other windows are skipped', () => {
    assert.equal(afterHide(0, ['text', 'text', 'web', 'text']), 2);
    assert.equal(afterHide(2, ['text', 'web', 'web', 'files']), 3);
    assert.equal(afterHide(3, ['text', 'web', 'files', 'files']), 0);
});

test('hiding the only app closes the switcher', () => {
    assert.equal(afterHide(0, ['text']), -1);
    assert.equal(afterHide(1, ['text', 'text']), -1);
});
