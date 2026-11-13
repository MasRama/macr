import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHOICES, choiceOf, isAvailable, isRecording, togglesFor } from '../../src/features/screenshot/logic/toolbar.js';

test('the toolbar reads in macOS order', () => {
    assert.deepEqual(CHOICES, ['screen', 'window', 'selection', 'record-screen', 'record-selection']);
});

test('each button sets GNOME’s capture type and screenshot or screencast', () => {
    assert.deepEqual(togglesFor('screen'), { type: 'screen', cast: false });
    assert.deepEqual(togglesFor('window'), { type: 'window', cast: false });
    assert.deepEqual(togglesFor('selection'), { type: 'selection', cast: false });
    assert.deepEqual(togglesFor('record-screen'), { type: 'screen', cast: true });
    assert.deepEqual(togglesFor('record-selection'), { type: 'selection', cast: true });
});

test('the lit button follows GNOME’s toggles', () => {
    for (const choice of CHOICES) assert.equal(choiceOf(togglesFor(choice)), choice);
    // GNOME cannot record a window; it falls back to a selection.
    assert.equal(choiceOf({ type: 'window', cast: true }), 'record-selection');
});

test('the capture button says Record only for the record buttons', () => {
    assert.deepEqual(CHOICES.filter(isRecording), ['record-screen', 'record-selection']);
});

test('window and record buttons need windows and a screencast service', () => {
    const none = { windows: false, recording: false };
    const all = { windows: true, recording: true };
    assert.deepEqual(CHOICES.filter((choice) => isAvailable(choice, none)), ['screen', 'selection']);
    assert.deepEqual(CHOICES.filter((choice) => isAvailable(choice, all)), CHOICES);
    assert.equal(isAvailable('window', { windows: true, recording: false }), true);
    assert.equal(isAvailable('record-screen', { windows: false, recording: true }), true);
});
