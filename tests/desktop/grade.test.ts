import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAY, gradeAt, NIGHT, sunTimes } from '../../src/features/desktop/logic/grade.js';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('unknown sun times fall back to 6:00 and 18:00', () => {
    assert.deepEqual(sunTimes(-1, -1), { sunrise: 6, sunset: 18 });
    assert.deepEqual(sunTimes(5.75, 17.9), { sunrise: 5.75, sunset: 17.9 });
    // Nonsense (sunset before sunrise) is ignored too.
    assert.deepEqual(sunTimes(19, 7), { sunrise: 6, sunset: 18 });
});

test('midday is the plain picture, midnight the night grade', () => {
    assert.deepEqual(gradeAt(12, 6, 18), DAY);
    assert.deepEqual(gradeAt(0, 6, 18), NIGHT);
    assert.deepEqual(gradeAt(23.5, 6, 18), NIGHT);
    assert.deepEqual(DAY, { brightness: 1, warmth: 0, saturation: 1 });
    assert.ok(NIGHT.brightness < 0.8 && NIGHT.warmth < 0);
});

test('sunrise and golden hour are warm', () => {
    assert.ok(gradeAt(6, 6, 18).warmth > 0.05);
    const golden = gradeAt(17.5, 6, 18);
    assert.ok(golden.warmth > 0.1);
    assert.ok(golden.saturation > 1);
});

test('the grade changes smoothly, without jumps, all day', () => {
    let last = gradeAt(0, 6, 18);
    for (let minute = 1; minute <= 24 * 60; minute++) {
        const now = gradeAt(minute / 60, 6, 18);
        assert.ok(Math.abs(now.brightness - last.brightness) < 0.01, `brightness jumps at ${minute}`);
        assert.ok(Math.abs(now.warmth - last.warmth) < 0.01, `warmth jumps at ${minute}`);
        last = now;
    }
    assert.ok(close(gradeAt(24, 6, 18).brightness, gradeAt(0, 6, 18).brightness));
});

test('the keyframes follow the sun', () => {
    // A late summer sunset: still plain at 18:00, golden near 20:00.
    assert.deepEqual(gradeAt(18, 5, 20.5), DAY);
    assert.ok(gradeAt(20, 5, 20.5).warmth > 0.1);
});
