import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coverSize, isPhoto, photoFor, PHOTO_HOURS } from '../../src/features/widgets/logic/photos.js';

test('pictures are photos, other files and hidden ones are not', () => {
    assert.equal(isPhoto('beach.jpg', 'image/jpeg'), true);
    assert.equal(isPhoto('IMG_0001.HEIC', 'image/heic'), false);
    assert.equal(isPhoto('shot.png', 'image/png'), true);
    assert.equal(isPhoto('pic.webp', 'image/webp'), true);
    assert.equal(isPhoto('logo.svg', 'image/svg+xml'), false);
    assert.equal(isPhoto('anim.gif', 'image/gif'), false);
    assert.equal(isPhoto('notes.txt', 'text/plain'), false);
    assert.equal(isPhoto('.thumb.jpg', 'image/jpeg'), false);
});

test('the photo changes every few hours and is the same within them', () => {
    assert.equal(PHOTO_HOURS, 3);
    const paths = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const at = (hours: number) => photoFor(paths, hours * 3600);
    assert.equal(at(0), at(2.9));
    assert.notEqual(at(0), at(3));
    assert.ok(paths.includes(at(100) as string));
    assert.equal(photoFor([], 0), null);
});

test('a photo is scaled to cover the square, its short side to the size', () => {
    assert.deepEqual(coverSize(4000, 3000, 300), { width: 400, height: 300 });
    assert.deepEqual(coverSize(3000, 4000, 300), { width: 300, height: 400 });
    assert.deepEqual(coverSize(200, 100, 300), { width: 600, height: 300 });
});
