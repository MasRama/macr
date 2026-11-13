import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THEME, indexTheme, takeTheme } from '../../src/features/sounds/logic/theme.js';

test('Macr remembers the user’s sound theme once and switches to its own', () => {
    assert.deepEqual(takeTheme('zorin'), { save: 'zorin', switchTo: THEME });
    // Left over from a session that ended with Macr on: what is saved stays.
    assert.deepEqual(takeTheme(THEME), { save: null, switchTo: null });
});

test('the theme falls back to the user’s own for every sound it does not have', () => {
    assert.match(indexTheme('zorin'), /^Inherits=zorin$/m);
    assert.match(indexTheme('zorin'), /^Directories=stereo$/m);
    assert.doesNotMatch(indexTheme(''), /Inherits/);
    // Its own theme is never inherited.
    assert.doesNotMatch(indexTheme(THEME), /Inherits/);
});
