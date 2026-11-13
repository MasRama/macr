import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newestScreenshot } from '../../src/features/screenshot/logic/files.js';
import { fitSize, releaseAction, swipeOffset, thumbnailPosition } from '../../src/features/screenshot/logic/thumbnail.js';

test('the thumbnail keeps the picture’s shape inside its box', () => {
    assert.deepEqual(fitSize({ width: 1920, height: 1080 }, { width: 200, height: 160 }), { width: 200, height: 113 });
    assert.deepEqual(fitSize({ width: 600, height: 1200 }, { width: 200, height: 160 }), { width: 80, height: 160 });
    assert.deepEqual(fitSize({ width: 120, height: 40 }, { width: 200, height: 160 }), { width: 120, height: 40 }, 'small pictures are not blown up');
    assert.deepEqual(fitSize({ width: 3000, height: 2 }, { width: 200, height: 160 }), { width: 200, height: 1 }, 'never thinner than a pixel');
});

test('it sits at the bottom right of the work area, above the dock', () => {
    const workArea = { x: 0, y: 32, width: 1920, height: 968 };
    assert.deepEqual(thumbnailPosition(workArea, { width: 200, height: 113 }, 16), { x: 1704, y: 871 });
    const second = { x: 1920, y: 0, width: 1280, height: 1024 };
    assert.deepEqual(thumbnailPosition(second, { width: 100, height: 100 }, 20), { x: 3080, y: 904 });
});

test('it only follows a drag to the right', () => {
    assert.equal(swipeOffset(40), 40);
    assert.equal(swipeOffset(0), 0);
    assert.equal(swipeOffset(-30), 0);
});

test('a press that barely moves is a click', () => {
    assert.equal(releaseAction({ dx: 0, dy: 0, ms: 120 }, 200), 'click');
    assert.equal(releaseAction({ dx: 3, dy: -2, ms: 400 }, 200), 'click');
});

test('a long or quick swipe right dismisses it', () => {
    assert.equal(releaseAction({ dx: 90, dy: 4, ms: 600 }, 200), 'dismiss', 'past a third of its width');
    assert.equal(releaseAction({ dx: 40, dy: 0, ms: 60 }, 200), 'dismiss', 'a flick');
});

test('a short slow swipe, or one to the left, puts it back', () => {
    assert.equal(releaseAction({ dx: 40, dy: 0, ms: 500 }, 200), 'return');
    assert.equal(releaseAction({ dx: -120, dy: 0, ms: 80 }, 200), 'return');
    assert.equal(releaseAction({ dx: 2, dy: 60, ms: 300 }, 200), 'return');
});

test('the newest PNG from the last few seconds is the screenshot just taken', () => {
    const now = 1_000_000;
    const files = [
        { name: 'Screenshot from 2026-11-13 09-00-01.png', modified: now - 60_000 },
        { name: 'Screenshot from 2026-11-13 09-01-00.png', modified: now - 300 },
        { name: 'notes.txt', modified: now - 10 },
        { name: 'Screencast from 2026-11-13 09-01-00.webm', modified: now - 5 },
    ];
    assert.equal(newestScreenshot(files, now), 'Screenshot from 2026-11-13 09-01-00.png');
});

test('two screenshots in the same second: the numbered one is newer', () => {
    const now = 1_000_000;
    const files = [
        { name: 'Screenshot from 2026-11-13 09-01-00-1.png', modified: now - 100 },
        { name: 'Screenshot from 2026-11-13 09-01-00.png', modified: now - 100 },
    ];
    assert.equal(newestScreenshot(files, now), 'Screenshot from 2026-11-13 09-01-00-1.png');
});

test('nothing recent means no file', () => {
    assert.equal(newestScreenshot([], 1000), null);
    assert.equal(newestScreenshot([{ name: 'Old.png', modified: 0 }], 60_000), null);
    assert.equal(newestScreenshot([{ name: 'a.PNG', modified: 59_000 }], 60_000), 'a.PNG');
});
