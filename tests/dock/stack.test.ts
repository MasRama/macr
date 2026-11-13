import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseView, FAN_MAX, fanSlot, folderIcon, gridShape, fitInside, isNewArrival, isShownName, PILE_MAX, pileEntries, pileLayers, visibleEntries, withStack } from '../../src/features/dock/logic/stack.js';

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

test('a folder stack gets its XDG folder’s icon', () => {
    const special = { documents: '/home/u/Documents', pictures: '/home/u/Pictures', desktop: '/home/u' };
    assert.equal(folderIcon('/home/u/Documents', special, '/home/u'), 'folder-documents');
    assert.equal(folderIcon('/home/u/Pictures/', special, '/home/u'), 'folder-pictures');
    assert.equal(folderIcon('/home/u/Projects', special, '/home/u'), 'folder');
    // Without a Desktop folder XDG points it at home: that is still the desktop's.
    assert.equal(folderIcon('/home/u', special, '/home/u'), 'user-desktop');
    assert.equal(folderIcon('/home/u', {}, '/home/u'), 'user-home');
});

test('a folder is added to the stacks once', () => {
    assert.deepEqual(withStack([], '/home/u/Documents/'), ['/home/u/Documents']);
    assert.deepEqual(withStack(['/a'], '/a'), ['/a']);
    assert.deepEqual(withStack(['/a'], '/b'), ['/a', '/b']);
    assert.deepEqual(withStack([], '/'), ['/']);
});

test('the pile holds the three newest finished items', () => {
    const shown = pileEntries([
        entry('a', 1, 1),
        entry('b', 2, 2),
        entry('c', 3, 3),
        entry('d', 4, 4),
        entry('e.part', 9, 9),
        entry('.f', 9, 9),
    ]);
    assert.equal(PILE_MAX, 3);
    assert.deepEqual(shown.map((e) => e.name), ['d', 'c', 'b']);
    assert.deepEqual(pileEntries<ReturnType<typeof entry>>([]), []);
});

test('the pile has a layer per item, the newest flat on top', () => {
    assert.deepEqual(pileLayers(0), []);
    assert.equal(pileLayers(1).length, 1);
    assert.equal(pileLayers(5).length, PILE_MAX);
    for (const count of [1, 2, 3]) {
        const top = pileLayers(count).at(-1)!;
        assert.equal(top.x, 0);
        assert.equal(top.y, 0);
        assert.equal(top.rotation, 0);
        assert.ok(top.size < 1);
    }
});

test('turned layers stay inside the icon', () => {
    for (const layer of pileLayers(PILE_MAX)) {
        const angle = (layer.rotation * Math.PI) / 180;
        const half = (layer.size / 2) * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
        assert.ok(half + Math.abs(layer.x) <= 0.5, `x fits for ${JSON.stringify(layer)}`);
        assert.ok(half + Math.abs(layer.y) <= 0.5, `y fits for ${JSON.stringify(layer)}`);
    }
});

test('only an item added after the newest one counts as arriving', () => {
    const old = entry('old', 10, 10);
    const newer = entry('newer', 20, 20);
    // The first read, after login or turning Macr on.
    assert.equal(isNewArrival(undefined, newer), false);
    // An empty folder gets its first item.
    assert.equal(isNewArrival(null, newer), true);
    assert.equal(isNewArrival(newer, newer), false);
    assert.equal(isNewArrival(old, newer), true);
    // The newest was deleted: the next one is not new.
    assert.equal(isNewArrival(newer, old), false);
    assert.equal(isNewArrival(newer, null), false);
});

test('an unfinished download does not arrive until it is renamed', () => {
    const done = entry('done.pdf', 10, 10);
    const partial = [done, entry('movie.mkv.crdownload', 30, 30)];
    assert.equal(isNewArrival(done, pileEntries(partial)[0] ?? null), false);
    const finished = [done, entry('movie.mkv', 30, 31)];
    assert.equal(isNewArrival(done, pileEntries(finished)[0] ?? null), true);
});

test('a picture keeps its shape inside the pile', () => {
    assert.deepEqual(fitInside(1600, 900, 40), { width: 40, height: 22.5 });
    assert.deepEqual(fitInside(600, 1200, 40), { width: 20, height: 40 });
    assert.deepEqual(fitInside(256, 256, 40), { width: 40, height: 40 });
    // An unreadable size fills the box.
    assert.deepEqual(fitInside(0, 0, 40), { width: 40, height: 40 });
});

test('only finished, visible files can change what a stack shows', () => {
    assert.equal(isShownName('report.pdf'), true);
    assert.equal(isShownName('movie.mkv.part'), false);
    assert.equal(isShownName('setup.exe.CRDOWNLOAD'), false);
    assert.equal(isShownName('.hidden'), false);
});
