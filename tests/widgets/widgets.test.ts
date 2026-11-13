import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boxOf, cityCode, dayRange, defaultSlots, fromFraction, handAngles, hourlyForecast, isDesktopIconsTitle, monthGrid, placeWidget, sizesOf, toFraction, upcomingEvents, widgetIds, widgetSize } from '../../src/features/widgets/logic/widgets.js';

const area = { x: 0, y: 32, width: 1920, height: 1048 };

test('only known widgets show, each once, in order', () => {
    assert.deepEqual(widgetIds(['weather', 'clock', 'weather', 'stocks', 'photos']), ['weather', 'clock', 'photos']);
    assert.deepEqual(widgetIds([]), []);
});

const small = { width: 170, height: 170 };
const medium = { width: 360, height: 170 };

test('widgets start in a column at the top right of the screen', () => {
    const slots = defaultSlots([small, small, small], area, 20, 24);
    assert.deepEqual(slots[0], { x: 1920 - 24 - 170, y: 32 + 24 });
    assert.deepEqual(slots[1], { x: 1920 - 24 - 170, y: 32 + 24 + 190 });
    assert.equal(slots.length, 3);
});

test('a medium widget in the column keeps to its right edge', () => {
    const slots = defaultSlots([small, medium, small], area, 20, 24);
    assert.equal(slots[1].x, 1920 - 24 - 360);
    assert.equal(slots[1].y, 32 + 24 + 190);
    assert.equal(slots[2].x, 1920 - 24 - 170);
});

test('a column that does not fit goes on to the left of its widest widget', () => {
    const short = { x: 0, y: 0, width: 1000, height: 450 };
    const slots = defaultSlots([small, medium, small], short, 20, 24);
    assert.equal(slots[0].x, 1000 - 24 - 170);
    assert.equal(slots[1].x, 1000 - 24 - 360);
    assert.equal(slots[2].x, 1000 - 24 - 360 - 20 - 170);
    assert.equal(slots[2].y, 24);
});

test('a dropped widget snaps to the grid and stays on screen', () => {
    assert.deepEqual(placeWidget(103, 205, small, area), { x: 104, y: 208 });
    assert.deepEqual(placeWidget(-50, 5, small, area), { x: 0, y: 32 });
    assert.deepEqual(placeWidget(1900, 1000, medium, area), { x: 1920 - 360, y: 32 + 1048 - 170 });
});

test('each widget comes in the sizes macOS has for it', () => {
    assert.deepEqual(sizesOf('clock'), ['small']);
    assert.deepEqual(sizesOf('calendar'), ['small', 'medium']);
    assert.deepEqual(sizesOf('weather'), ['small', 'medium']);
    assert.equal(widgetSize('calendar', 'medium'), 'medium');
    assert.equal(widgetSize('clock', 'medium'), 'small');
    assert.equal(widgetSize('weather', undefined), 'small');
    assert.equal(widgetSize('weather', 'large'), 'small');
});

test('a medium widget is two small ones and the gap between them wide', () => {
    assert.deepEqual(boxOf('small', 164, 20), { width: 164, height: 164 });
    assert.deepEqual(boxOf('medium', 164, 20), { width: 348, height: 164 });
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

const at = (h: number, m = 0) => new Date(2026, 10, 13, h, m).getTime();

test('upcoming events: those not over yet, soonest first, all-day ones first', () => {
    const events = [
        { summary: 'Lunch', start: at(12), end: at(13) },
        { summary: 'Standup', start: at(9), end: at(9, 15) },
        { summary: 'Holiday', start: at(0), end: at(24) },
        { summary: 'Review', start: at(16), end: at(17) },
        { summary: 'Call', start: at(10, 30), end: at(11, 30) },
    ];
    const shown = upcomingEvents(events, at(10, 45), 3);
    assert.deepEqual(shown.map((e) => e.summary), ['Holiday', 'Call', 'Lunch']);
    assert.equal(shown[0].allDay, true);
    assert.equal(shown[1].allDay, false);
    assert.deepEqual(upcomingEvents([], at(10), 3), []);
});

test('a later day\'s all-day event comes after today\'s events', () => {
    const events = [
        { summary: 'Tomorrow holiday', start: at(24), end: at(48) },
        { summary: 'Tomorrow standup', start: at(33), end: at(33, 30) },
        { summary: 'Review', start: at(15), end: at(16) },
    ];
    assert.deepEqual(upcomingEvents(events, at(10), 3).map((e) => e.summary), ['Review', 'Tomorrow holiday', 'Tomorrow standup']);
});

test('hourly forecast: the next hours from now, one per hour', () => {
    const hour = 3600;
    const now = 1_800_000_000;
    const items = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7].map((h) => ({ time: now - (now % hour) + h * hour, temperature: 20 + h, icon: `i${h}` }));
    const next = hourlyForecast(items, now + 600, 5);
    assert.equal(next.length, 5);
    assert.equal(next[0].temperature, 21);
    assert.equal(next[4].temperature, 25);
    assert.deepEqual(hourlyForecast([], now, 5), []);
});
