import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ShakeDetector, turns } from '../../src/features/cursor/logic/shake.js';
import { cursorImages, inheritedThemes, largestImage } from '../../src/features/cursor/logic/xcursor.js';

/** A wiggle between `from` and `to`, `strokes` times, `step` px per sample. */
function wiggle(from: number, to: number, strokes: number, step = 20): number[] {
    const values = [from];
    let target = to;
    for (let s = 0; s < strokes; s++) {
        while (values[values.length - 1] !== target) {
            const last = values[values.length - 1];
            values.push(last + Math.sign(target - last) * Math.min(step, Math.abs(target - last)));
        }
        target = target === to ? from : to;
    }
    return values;
}

test('a stroke that turns back counts once it travelled far enough', () => {
    assert.equal(turns(wiggle(0, 200, 5)), 4);
    assert.equal(turns(wiggle(0, 40, 5)), 0);
    assert.equal(turns([0, 100, 200, 300]), 0);
});

test('jitter inside a stroke does not count', () => {
    assert.equal(turns([0, 50, 45, 100, 95, 150, 30, 150]), 2);
});

test('a quick wiggle is a shake, a slow one is not', () => {
    const fast = new ShakeDetector();
    const xs = wiggle(500, 700, 5);
    const shook = xs.map((x, i) => fast.push(i * 10, x, 300));
    assert.equal(shook[shook.length - 1], true);

    const slow = new ShakeDetector();
    const late = xs.map((x, i) => slow.push(i * 60, x, 300));
    assert.equal(late.some(Boolean), false);
});

test('up and down shakes too', () => {
    const detector = new ShakeDetector();
    const ys = wiggle(300, 500, 5);
    assert.equal(ys.map((y, i) => detector.push(i * 10, 600, y)).pop(), true);
});

test('moving across the screen is no shake', () => {
    const detector = new ShakeDetector();
    const shook = Array.from({ length: 60 }, (_, i) => detector.push(i * 10, i * 30, 200));
    assert.equal(shook.some(Boolean), false);
});

/** An Xcursor file with one image per size (nominal, side), filled with `fill`. */
function xcursor(sizes: [number, number][]): Uint8Array {
    const header = 16 + sizes.length * 12;
    const chunks = sizes.map(([, side]) => 36 + side * side * 4);
    const total = header + chunks.reduce((a, b) => a + b, 0);
    const data = new Uint8Array(total);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0x72756358, true);
    view.setUint32(4, 16, true);
    view.setUint32(8, 0x10000, true);
    view.setUint32(12, sizes.length, true);
    let position = header;
    sizes.forEach(([nominal, side], i) => {
        view.setUint32(16 + i * 12, 0xfffd0002, true);
        view.setUint32(20 + i * 12, nominal, true);
        view.setUint32(24 + i * 12, position, true);
        view.setUint32(position, 36, true);
        view.setUint32(position + 4, 0xfffd0002, true);
        view.setUint32(position + 8, nominal, true);
        view.setUint32(position + 16, side, true);
        view.setUint32(position + 20, side, true);
        view.setUint32(position + 24, Math.round(side / 6), true);
        view.setUint32(position + 28, Math.round(side / 6), true);
        position += 36 + side * side * 4;
    });
    return data;
}

test('the images of an Xcursor file are read with their hotspot', () => {
    const images = cursorImages(xcursor([[24, 32], [72, 96]]));
    assert.equal(images.length, 2);
    assert.deepEqual(images[1], { nominal: 72, width: 96, height: 96, xhot: 16, yhot: 16, offset: 16 + 24 + 36 + 32 * 32 * 4 + 36 });
    assert.equal(largestImage(images)?.width, 96);
});

test('something that is not an Xcursor file, or is cut short, gives no images', () => {
    assert.deepEqual(cursorImages(new TextEncoder().encode('<svg></svg>')), []);
    const cut = xcursor([[24, 32]]).slice(0, 200);
    assert.deepEqual(cursorImages(cut), []);
    assert.equal(largestImage([]), null);
});

test('a theme’s fallbacks come from its index.theme', () => {
    assert.deepEqual(inheritedThemes('[Icon Theme]\nName=X\nInherits=Adwaita, hicolor\n'), ['Adwaita', 'hicolor']);
    assert.deepEqual(inheritedThemes('[Icon Theme]\nName=X\n'), []);
});
