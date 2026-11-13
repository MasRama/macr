import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assignmentOf, placement, withAssignment } from '../../src/features/dock/logic/assign.js';

const saved = ['firefox.desktop=all', 'org.gnome.Terminal.desktop=2', 'broken', 'x.desktop=-1', 'y.desktop=abc'];

test('assignments are read from the setting, bad entries ignored', () => {
    assert.equal(assignmentOf(saved, 'firefox.desktop'), 'all');
    assert.equal(assignmentOf(saved, 'org.gnome.Terminal.desktop'), 2);
    assert.equal(assignmentOf(saved, 'gedit.desktop'), null);
    assert.equal(assignmentOf(saved, 'x.desktop'), null);
    assert.equal(assignmentOf(saved, 'y.desktop'), null);
    assert.equal(assignmentOf(['a=b=all'], 'a=b'), 'all', 'the last = splits');
});

test('assigning replaces the app’s entry, None removes it', () => {
    assert.deepEqual(withAssignment(saved, 'firefox.desktop', 0), ['org.gnome.Terminal.desktop=2', 'broken', 'x.desktop=-1', 'y.desktop=abc', 'firefox.desktop=0']);
    assert.deepEqual(withAssignment(['a.desktop=1'], 'a.desktop', null), []);
    assert.deepEqual(withAssignment([], 'a.desktop', 'all'), ['a.desktop=all']);
});

test('a window goes onto every desktop, or to its own', () => {
    assert.deepEqual(placement('all', 4), { stick: true });
    assert.deepEqual(placement(1, 4), { stick: false, index: 1, add: 0 });
    assert.equal(placement(null, 4), null);
});

test('a desktop that is gone is added at the end first', () => {
    assert.deepEqual(placement(5, 3), { stick: false, index: 5, add: 3 });
    assert.deepEqual(placement(3, 3), { stick: false, index: 3, add: 1 });
});
