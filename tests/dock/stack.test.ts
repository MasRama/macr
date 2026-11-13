import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseView, FAN_MAX, fanSlot, gridShape, visibleEntries } from '../../src/features/dock/logic/stack.js';

const entry = (name: string, created: number | null, modified: number, hidden = false) => ({ name, created, modified, hidden });

test('hidden files and unfinished downloads are left out', () => {
    const shown = visibleEntries([
        entry('report.pdf', 10, 10),
        entry('.secret', 20, 20),
        entry('movie.mkv.part', 30, 30),
        entry('setup.exe.crdownload', 30, 30),
        entry('page.html.download', 30, 30),
        entry('Unconfirmed 123.tmp', 30, 30),
        entry('flagged', 30, 30, true),
    ]);
    assert.deepEqual(shown.map((e) => e.name), ['report.pdf']);
});

test('newest first, by the time a file was added when known', () => {
    const shown = visibleEntries([entry('old', 1, 500), entry('new', 400, 400), entry('no-birth', null, 300)]);
    assert.deepEqual(shown.map((e) => e.name), ['new', 'no-birth', 'old']);
});

test('a few items fan out, many show as a grid, unless the view is chosen', () => {
    assert.equal(chooseView(0, 'automatic'), 'fan');
    assert.equal(chooseView(FAN_MAX, 'automatic'), 'fan');
    assert.equal(chooseView(FAN_MAX + 1, 'automatic'), 'grid');
    assert.equal(chooseView(3, 'grid'), 'grid');
    assert.equal(chooseView(40, 'fan'), 'fan');
});

test('the fan rises from the dock and curves to the right', () => {
    const slots = Array.from({ length: FAN_MAX }, (_, i) => fanSlot(i, 60));
    assert.equal(slots[0].x, 0);
    for (let i = 1; i < slots.length; i++) {
        assert.ok(slots[i].y < slots[i - 1].y, 'rises');
        assert.ok(slots[i].x > slots[i - 1].x, 'curves right');
        assert.ok(slots[i].rotation >= slots[i - 1].rotation, 'tilts more');
    }
    assert.ok(Math.abs(slots[FAN_MAX - 1].rotation) <= 15);
});

test('the grid is at most five wide and four rows tall before it scrolls', () => {
    assert.deepEqual(gridShape(3), { columns: 3, rows: 1 });
    assert.deepEqual(gridShape(12), { columns: 5, rows: 3 });
    assert.deepEqual(gridShape(60), { columns: 5, rows: 4 });
    assert.deepEqual(gridShape(0), { columns: 1, rows: 1 });
});
