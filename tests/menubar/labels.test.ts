import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appLabel, shortTitle } from '../../src/features/menubar/logic/labels.js';

test('the focused app gives the label; nothing focused reads Files, like Finder', () => {
    assert.equal(appLabel('Text Editor'), 'Text Editor');
    assert.equal(appLabel(null), 'Files');
    assert.equal(appLabel('  '), 'Files');
});

test('long window titles are cut with an ellipsis', () => {
    assert.equal(shortTitle('short'), 'short');
    assert.equal(shortTitle('x'.repeat(70)), `${'x'.repeat(59)}…`);
    assert.equal(shortTitle(''), 'Untitled');
});
