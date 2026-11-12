import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alphaBox, isThemed, squirclePath, themeFamily, tileLayout, tileSvg } from '../../src/features/appicons/logic/tile.js';

/** A w×h RGBA image, opaque inside [x0, x1) × [y0, y1). */
function image(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
    const pixels = new Uint8Array(w * h * 4);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels[(y * w + x) * 4 + 3] = 255;
    return pixels;
}

test('the theme family is the theme and inherited variants of it', () => {
    assert.deepEqual(themeFamily('MacTahoe-dark', ['MacTahoe', 'hicolor', 'breeze']), ['MacTahoe-dark', 'MacTahoe']);
    assert.deepEqual(themeFamily('MacTahoe', ['hicolor', 'breeze']), ['MacTahoe']);
});

test('an icon is themed when it comes from the theme family', () => {
    const family = ['MacTahoe'];
    assert.ok(isThemed('/home/u/.local/share/icons/MacTahoe/apps/scalable/firefox.svg', family));
    assert.ok(!isThemed('/usr/share/icons/hicolor/128x128/apps/claude.png', family));
    assert.ok(!isThemed('/usr/share/pixmaps/chatgpt.png', family));
    assert.ok(!isThemed('/usr/share/icons/MacTahoe-other/apps/x.svg', family), 'a whole folder name, not a prefix');
});

test('the alpha box finds the drawn part and how much of it is filled', () => {
    const square = alphaBox(image(10, 10, 2, 3, 8, 9), 10, 10, 40, 4);
    assert.deepEqual({ ...square, fill: Math.round(square.fill * 100) }, { x: 2, y: 3, width: 6, height: 6, fill: 100 });

    // A diagonal line fills little of its box.
    const pixels = new Uint8Array(10 * 10 * 4);
    for (let i = 0; i < 10; i++) pixels[(i * 10 + i) * 4 + 3] = 255;
    assert.ok(alphaBox(pixels, 10, 10, 40, 4).fill < 0.2);

    assert.equal(alphaBox(new Uint8Array(400), 10, 10, 40, 4).width, 0, 'empty image');

    // A faint shadow around a square does not count.
    const shadowed = image(10, 10, 2, 2, 8, 8);
    for (let x = 0; x < 10; x++) shadowed[(9 * 10 + x) * 4 + 3] = 60;
    assert.equal(alphaBox(shadowed, 10, 10, 40, 4).height, 6);
});

test('a full square icon fills the tile, anything else sits on it', () => {
    const tile = tileLayout({ x: 0, y: 0, width: 128, height: 128, fill: 0.98 }, 256);
    assert.equal(tile.mode, 'fill');
    assert.equal(tile.scale, 224 / 128);
    assert.equal(tile.x, 16);
    assert.equal(tile.y, 16);

    const logo = tileLayout({ x: 10, y: 20, width: 100, height: 50, fill: 0.5 }, 256);
    assert.equal(logo.mode, 'framed');
    assert.equal(logo.scale, 1.6, 'the longer side becomes 160 px');
    // Centred: the box (10..110, 20..70) scaled lands centred on 128.
    assert.equal(logo.x + (10 + 50) * logo.scale, 128);
    assert.equal(logo.y + (20 + 25) * logo.scale, 128);
});

test('the squircle is a closed path inside its square', () => {
    const path = squirclePath(16, 16, 224);
    assert.match(path, /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+ Z$/);
    const numbers = path.match(/[\d.]+/g)!.map(Number);
    assert.ok(Math.min(...numbers) >= 16 && Math.max(...numbers) <= 240);
});

test('the tile svg embeds the icon at the layout position', () => {
    const svg = tileSvg('QUJD', { mode: 'framed', x: 48, y: 64, scale: 0.5 }, 256, 256);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 256 256"/);
    assert.match(svg, /href="data:image\/png;base64,QUJD"/);
    assert.match(svg, /transform="translate\(48 64\) scale\(0.5\)"/);
    assert.match(svg, /linearGradient/, 'framed icons get the tile');
    assert.doesNotMatch(tileSvg('QUJD', { mode: 'fill', x: 16, y: 16, scale: 1 }, 256, 256), /linearGradient/);
});
