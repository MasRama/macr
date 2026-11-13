import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addNote, dropEmpty, newId, NOTE_COLORS, parseNotes, removeNote, serializeNotes, shownNote, withColor, withText } from '../../src/shared/logic/notes.js';

test('notes come from JSON, skipping what is not a note', () => {
    const json = JSON.stringify([{ id: 'a', text: 'Milk', color: 'blue' }, { id: 'b', text: 'Eggs', color: 'orange' }, { text: 'no id' }, 'junk', { id: 'c' }]);
    assert.deepEqual(parseNotes(json), [
        { id: 'a', text: 'Milk', color: 'blue' },
        { id: 'b', text: 'Eggs', color: 'yellow' },
        { id: 'c', text: '', color: 'yellow' },
    ]);
});

test('broken or empty JSON is no notes', () => {
    assert.deepEqual(parseNotes(''), []);
    assert.deepEqual(parseNotes('{'), []);
    assert.deepEqual(parseNotes('{"id":"a"}'), []);
});

test('notes go back to JSON', () => {
    const notes = [{ id: 'a', text: 'Milk', color: 'pink' as const }];
    assert.deepEqual(parseNotes(serializeNotes(notes)), notes);
});

test('five colours, yellow first', () => {
    assert.deepEqual(NOTE_COLORS, ['yellow', 'blue', 'green', 'pink', 'purple']);
});

test('a new note goes first, yellow unless asked', () => {
    const notes = [{ id: 'a', text: 'Milk', color: 'blue' as const }];
    assert.deepEqual(addNote(notes, 'b'), [{ id: 'b', text: '', color: 'yellow' }, ...notes]);
    assert.deepEqual(addNote(notes, 'b', 'green')[0].color, 'green');
});

test('text and colour change one note', () => {
    const notes = [
        { id: 'a', text: 'Milk', color: 'blue' as const },
        { id: 'b', text: '', color: 'yellow' as const },
    ];
    assert.deepEqual(withText(notes, 'b', 'Call Mum'), [notes[0], { id: 'b', text: 'Call Mum', color: 'yellow' }]);
    assert.deepEqual(withColor(notes, 'a', 'purple'), [{ id: 'a', text: 'Milk', color: 'purple' }, notes[1]]);
    assert.equal(withText(notes, 'x', 'nothing'), notes);
});

test('a note is removed by id', () => {
    const notes = [
        { id: 'a', text: 'Milk', color: 'blue' as const },
        { id: 'b', text: '', color: 'yellow' as const },
    ];
    assert.deepEqual(removeNote(notes, 'a'), [notes[1]]);
});

test('an empty note goes when editing ends, a written one stays', () => {
    const notes = [
        { id: 'a', text: '  \n', color: 'blue' as const },
        { id: 'b', text: 'Milk', color: 'yellow' as const },
    ];
    assert.deepEqual(dropEmpty(notes, 'a'), [notes[1]]);
    assert.equal(dropEmpty(notes, 'b'), notes);
});

test('the note a widget shows: its own, else the first; none without notes', () => {
    const notes = [
        { id: 'a', text: 'Milk', color: 'blue' as const },
        { id: 'b', text: 'Eggs', color: 'yellow' as const },
    ];
    assert.equal(shownNote(notes, 'b'), notes[1]);
    assert.equal(shownNote(notes, 'gone'), notes[0]);
    assert.equal(shownNote(notes, null), notes[0]);
    assert.equal(shownNote([], 'a'), null);
});

test('a new id is not taken yet', () => {
    const id = newId(1000, ['n1000']);
    assert.notEqual(id, 'n1000');
    assert.match(id, /^n1000/);
    assert.equal(newId(1000, []), 'n1000');
});
