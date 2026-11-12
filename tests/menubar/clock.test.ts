import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clockFormat } from '../../src/features/menubar/logic/clock.js';

test('24-hour clock with weekday and date reads like macOS', () => {
    assert.equal(clockFormat({ use24h: true, showWeekday: true, showDate: true, showSeconds: false }), '%a %-d %b  %H:%M');
});

test('12-hour clock adds AM/PM without a leading zero', () => {
    assert.equal(clockFormat({ use24h: false, showWeekday: true, showDate: true, showSeconds: false }), '%a %-d %b  %-l:%M %p');
});

test('seconds, and weekday or date turned off', () => {
    assert.equal(clockFormat({ use24h: true, showWeekday: false, showDate: false, showSeconds: true }), '%H:%M:%S');
    assert.equal(clockFormat({ use24h: true, showWeekday: true, showDate: false, showSeconds: false }), '%a  %H:%M');
    assert.equal(clockFormat({ use24h: true, showWeekday: false, showDate: true, showSeconds: false }), '%-d %b  %H:%M');
});
