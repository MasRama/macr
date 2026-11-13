import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addReminder, parseReminders, remindersShown, removeReminder, serializeReminders } from '../../src/features/widgets/logic/reminders.js';

test('reminders come from JSON, skipping what is not one', () => {
    const json = JSON.stringify([{ id: 'a', text: 'Buy milk' }, { id: 'b' }, { text: 'no id' }, 7]);
    assert.deepEqual(parseReminders(json), [{ id: 'a', text: 'Buy milk' }]);
    assert.deepEqual(parseReminders('nope'), []);
    assert.deepEqual(parseReminders('{}'), []);
});

test('reminders go back to JSON', () => {
    const list = [{ id: 'a', text: 'Buy milk' }];
    assert.deepEqual(parseReminders(serializeReminders(list)), list);
});

test('a new reminder goes last, trimmed; an empty one is not added', () => {
    const list = [{ id: 'a', text: 'Buy milk' }];
    assert.deepEqual(addReminder(list, 'b', '  Call Mum '), [...list, { id: 'b', text: 'Call Mum' }]);
    assert.equal(addReminder(list, 'b', '   '), list);
});

test('a ticked-off reminder is removed', () => {
    const list = [
        { id: 'a', text: 'Buy milk' },
        { id: 'b', text: 'Call Mum' },
    ];
    assert.deepEqual(removeReminder(list, 'a'), [list[1]]);
});

test('how many reminders each size lists', () => {
    assert.equal(remindersShown('small'), 3);
    assert.equal(remindersShown('medium'), 3);
    assert.equal(remindersShown('large'), 9);
});
