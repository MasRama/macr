import assert from 'node:assert/strict';
import { test } from 'node:test';

import { previewUri, selectionStep, stepIndex } from '../../src/shared/logic/quick-look.js';

test('only local files can be previewed', () => {
    assert.equal(previewUri('file:///home/ren/Downloads/a.pdf'), 'file:///home/ren/Downloads/a.pdf');
    assert.equal(previewUri('org.gnome.TextEditor.desktop'), null);
    assert.equal(previewUri('https://example.com/a.png'), null);
    assert.equal(previewUri('calc-result-42'), null);
    assert.equal(previewUri(''), null);
});

test("Sushi's arrow keys step back with Left and Up, forward with Right and Down", () => {
    // Gtk.DirectionType: TAB_FORWARD 0, TAB_BACKWARD 1, UP 2, DOWN 3, LEFT 4, RIGHT 5.
    assert.equal(selectionStep(4), -1);
    assert.equal(selectionStep(2), -1);
    assert.equal(selectionStep(5), 1);
    assert.equal(selectionStep(3), 1);
    assert.equal(selectionStep(0), 0);
    assert.equal(selectionStep(9), 0);
});

test('stepping stops at either end of the list', () => {
    assert.equal(stepIndex(0, 1, 3), 1);
    assert.equal(stepIndex(2, 1, 3), 2);
    assert.equal(stepIndex(0, -1, 3), 0);
    assert.equal(stepIndex(1, -1, 3), 0);
    assert.equal(stepIndex(0, 1, 1), 0);
    assert.equal(stepIndex(0, 1, 0), -1);
});
