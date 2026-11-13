import assert from 'node:assert/strict';
import { test } from 'node:test';

import { batteryStatus, BatteryState, clockTime } from '../../src/features/menubar/logic/battery.js';

const status = (state: BatteryState, extra: Partial<{ percentage: number; timeToEmpty: number; timeToFull: number }> = {}) =>
    batteryStatus({ percentage: 76.4, state, timeToEmpty: 0, timeToFull: 0, ...extra });

test('battery time is hours and minutes', () => {
    assert.equal(clockTime(3 * 3600 + 20 * 60), '3:20');
    assert.equal(clockTime(5 * 60 + 40), '0:05');
    assert.equal(clockTime(59), '0:00');
});

test('on battery: the time left, else still working it out', () => {
    assert.deepEqual(status(BatteryState.DISCHARGING, { timeToEmpty: 12000 }), { percent: '76%', source: 'battery', time: { kind: 'remaining', value: '3:20' } });
    assert.deepEqual(status(BatteryState.DISCHARGING).time, { kind: 'calculating' });
    assert.equal(status(BatteryState.PENDING_DISCHARGE).source, 'battery');
});

test('on the power adapter: the time to full, charged, or not charging', () => {
    assert.deepEqual(status(BatteryState.CHARGING, { timeToFull: 2700 }), { percent: '76%', source: 'adapter', time: { kind: 'until-full', value: '0:45' } });
    assert.deepEqual(status(BatteryState.FULLY_CHARGED, { percentage: 100 }), { percent: '100%', source: 'adapter', time: { kind: 'charged' } });
    assert.deepEqual(status(BatteryState.PENDING_CHARGE).time, { kind: 'not-charging' });
    assert.deepEqual(status(BatteryState.CHARGING).time, { kind: 'calculating' });
});

test('no battery gives nothing to show', () => {
    assert.equal(status(BatteryState.UNKNOWN, { percentage: 0 }).time, null);
});
