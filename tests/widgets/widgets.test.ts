import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cityCode, dayRange, defaultSlots, fromFraction, handAngles, isDesktopIconsTitle, monthGrid, placeWidget, toFraction, widgetIds } from '../../src/features/widgets/logic/widgets.js';

const area = { x: 0, y: 32, width: 1920, height: 1048 };

test('only known widgets show, each once, in order', () => {
    assert.deepEqual(widgetIds(['weather', 'clock', 'weather', 'photos']), ['weather', 'clock']);
    assert.deepEqual(widgetIds([]), []);
});

test('widgets start in a column at the top right of the screen', () => {
    const slots = defaultSlots(3, area, 170, 20, 24);
    assert.deepEqual(slots[0], { x: 1920 - 24 - 170, y: 32 + 24 });
    assert.deepEqual(slots[1], { x: 1920 - 24 - 170, y: 32 + 24 + 190 });
    assert.equal(slots.length, 3);
});

test('a column that does not fit goes on to the left', () => {
    const short = { x: 0, y: 0, width: 1000, height: 450 };
    const slots = defaultSlots(3, short, 170, 20, 24);
    assert.equal(slots[0].x, slots[1].x);
    assert.equal(slots[2].x, slots[0].x - 190);
    assert.equal(slots[2].y, 24);
});

test('a dropped widget snaps to the grid and stays on screen', () => {
    assert.deepEqual(placeWidget(103, 205, 170, area), { x: 104, y: 208 });
    assert.deepEqual(placeWidget(-50, 5, 170, area), { x: 0, y: 32 });
    assert.deepEqual(placeWidget(1900, 1000, 170, area), { x: 1920 - 170, y: 32 + 1048 - 170 });
});

test('a place is kept as fractions of the work area', () => {
    const f = toFraction({ x: 960, y: 556 }, area);
    assert.deepEqual(f, [0.5, 0.5]);
    assert.deepEqual(fromFraction(f, area), { x: 960, y: 556 });
    // On a smaller screen it lands in the same spot, relatively.
    assert.deepEqual(fromFraction([0.5, 0.5], { x: 0, y: 0, width: 1000, height: 800 }), { x: 500, y: 400 });
});

test('the month grid starts on the week’s first day', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const sunday = monthGrid(2026, 11, 0);
    assert.deepEqual(sunday[0], [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(sunday[4], [29, 30, null, null, null, null, null]);
    assert.equal(sunday.length, 5);
    const monday = monthGrid(2026, 11, 1);
    assert.deepEqual(monday[0], [null, null, null, null, null, null, 1]);
    assert.equal(monday.length, 6);
    // February 2026: 28 days from a Sunday, four full weeks.
    assert.equal(monthGrid(2026, 2, 0).length, 4);
    assert.deepEqual(monthGrid(2028, 2, 0).flat().filter(Boolean).length, 29);
});

test('clock hands point the right way', () => {
    assert.deepEqual(handAngles(0, 0, 0), { hour: 0, minute: 0, second: 0 });
    assert.deepEqual(handAngles(15, 0, 0), { hour: 90, minute: 0, second: 0 });
    assert.deepEqual(handAngles(6, 30, 15), { hour: 195, minute: 181.5, second: 90 });
});

test('the clock shows a short city name', () => {
    assert.equal(cityCode('Asia/Jakarta'), 'JAK');
    assert.equal(cityCode('America/Los_Angeles'), 'LOS');
    assert.equal(cityCode('UTC'), 'UTC');
    assert.equal(cityCode(''), '');
});

test('today’s high and low come from the forecast and the temperature now', () => {
    assert.deepEqual(dayRange([24.2, 31.6, 27]), { low: 24, high: 32 });
    assert.equal(dayRange([]), null);
});

test('desktop-icons windows are known by their title', () => {
    assert.equal(isDesktopIconsTitle('Desktop Icons 1'), true);
    assert.equal(isDesktopIconsTitle('@!0,0;BDHF'), true);
    assert.equal(isDesktopIconsTitle('@!0,0;TDH'), false);
    assert.equal(isDesktopIconsTitle('Budget 2026.ods — LibreOffice Calc'), false);
    assert.equal(isDesktopIconsTitle(null), false);
});
