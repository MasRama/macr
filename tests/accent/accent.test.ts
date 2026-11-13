import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ACCENT_RULES, ACCENTS, accentCss, accentName, wallpaperAccent } from '../../src/features/accent/logic/accent.js';

/** A width x height RGB(A) picture filled by `color(x, y)`. */
function picture(width: number, height: number, color: (x: number, y: number) => [number, number, number], channels = 3, padding = 0) {
    const rowstride = width * channels + padding;
    const pixels = new Uint8Array(rowstride * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b] = color(x, y);
            const at = y * rowstride + x * channels;
            pixels[at] = r;
            pixels[at + 1] = g;
            pixels[at + 2] = b;
            if (channels === 4) pixels[at + 3] = 255;
        }
    }
    return { pixels, width, height, rowstride, channels };
}

test('the accent setting falls back to blue for anything unknown', () => {
    assert.equal(accentName('purple'), 'purple');
    assert.equal(accentName('wallpaper'), 'blue');
    assert.equal(accentName('teal'), 'blue');
    assert.equal(ACCENTS.blue.color, '#0a84ff');
});

test('a blue sky picks blue, a sunset orange, a meadow green', () => {
    assert.equal(wallpaperAccent(picture(16, 16, () => [40, 110, 230])), 'blue');
    assert.equal(wallpaperAccent(picture(16, 16, () => [245, 140, 30])), 'orange');
    assert.equal(wallpaperAccent(picture(16, 16, () => [60, 190, 80], 4, 3)), 'green');
    assert.equal(wallpaperAccent(picture(16, 16, () => [150, 70, 220])), 'purple');
    // Pale blossoms are pink, a strong red stays red.
    assert.equal(wallpaperAccent(picture(16, 16, () => [245, 190, 200])), 'pink');
    assert.equal(wallpaperAccent(picture(16, 16, () => [230, 30, 25])), 'red');
});

test('a grey or dark picture gives graphite', () => {
    assert.equal(wallpaperAccent(picture(16, 16, () => [128, 128, 130])), 'graphite');
    assert.equal(wallpaperAccent(picture(16, 16, () => [12, 8, 20])), 'graphite');
    assert.equal(wallpaperAccent(picture(0, 0, () => [0, 0, 0])), 'graphite');
});

test('the vivid part of a mostly grey picture wins', () => {
    // A grey city with a red quarter.
    const red = picture(16, 16, (x, y) => (x < 8 && y < 8 ? [225, 40, 45] : [110, 110, 112]));
    assert.equal(wallpaperAccent(red), 'red');
    // A sliver of colour is not enough.
    const sliver = picture(16, 16, (x, y) => (x === 0 && y === 0 ? [225, 40, 45] : [110, 110, 112]));
    assert.equal(wallpaperAccent(sliver), 'graphite');
});

test('the generated stylesheet re-colours every accent rule', () => {
    const css = accentCss('orange');
    assert.ok(css.includes('#ff9f0a'));
    assert.ok(!css.includes('#0a84ff'));
    assert.ok(css.includes('rgba(255, 159, 10, 0.85)'));
    for (const rule of ACCENT_RULES.filter((r) => r.property)) for (const selector of rule.selectors) assert.ok(css.includes(selector), selector);
    // One class stronger than Macr's own rule, which would win a tie.
    assert.ok(css.includes('.macr-menu.macr-menu .popup-menu-item:hover'));
    assert.ok(css.includes('.macr-expose-highlight.macr-expose-highlight {'));
});

test('text on a yellow accent turns dark to stay readable', () => {
    const yellow = accentCss('yellow');
    assert.ok(yellow.includes('color: #1d1d1f'));
    assert.ok(yellow.includes('.macr-menu.macr-light .popup-menu-item:hover'));
    assert.ok(!accentCss('red').includes('color: #1d1d1f'));
});

test('every accent blue in stylesheet.css is covered by the accent rules', () => {
    const sheet = readFileSync(new URL('../../../stylesheet.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const known = new Set(ACCENT_RULES.flatMap((rule) => rule.selectors));
    for (const block of sheet.split('}')) {
        const [selectorText, body] = block.split('{');
        if (!body || !/#0a84ff|rgba\(10, ?132, ?255/i.test(body)) continue;
        for (const selector of selectorText.split(',').map((s) => s.trim().replace(/\s+/g, ' '))) {
            assert.ok(known.has(selector), `${selector} uses the accent but is not in ACCENT_RULES`);
        }
    }
});
