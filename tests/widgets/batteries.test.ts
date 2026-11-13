import assert from 'node:assert/strict';
import { test } from 'node:test';

import { batteryIcon, type BatteryDevice, BATTERIES_MAX, batteryLevel, shownBatteries } from '../../src/features/widgets/logic/batteries.js';

const device = (kind: string, percentage: number, extra: Partial<BatteryDevice> = {}): BatteryDevice => ({
    kind,
    percentage,
    present: true,
    powerSupply: false,
    charging: false,
    name: kind,
    ...extra,
});

test('the computer battery comes first, then the other devices by name', () => {
    const shown = shownBatteries([
        device('mouse', 50, { name: 'MX Master' }),
        device('battery', 80, { powerSupply: true }),
        device('headset', 30, { name: 'AirPods' }),
    ]);
    assert.deepEqual(shown.map((d) => d.name), ['battery', 'AirPods', 'MX Master']);
});

test('line power, missing batteries and the composite display device are left out', () => {
    const shown = shownBatteries([
        device('line-power', 0),
        device('battery', 0, { powerSupply: true, present: false }),
        device('keyboard', 40),
        device('ups', 100, { present: false }),
    ]);
    assert.deepEqual(shown.map((d) => d.kind), ['keyboard']);
});

test('at most four devices', () => {
    assert.equal(BATTERIES_MAX, 4);
    const many = ['a', 'b', 'c', 'd', 'e'].map((name) => device('mouse', 50, { name }));
    assert.equal(shownBatteries(many).length, 4);
});

test('a battery is low at 20% or less unless it charges', () => {
    assert.equal(batteryLevel(device('battery', 21)), 'normal');
    assert.equal(batteryLevel(device('battery', 20)), 'low');
    assert.equal(batteryLevel(device('battery', 5, { charging: true })), 'charging');
    assert.equal(batteryLevel(device('battery', 90, { charging: true })), 'charging');
});

test('each kind of device has its icon', () => {
    assert.deepEqual(batteryIcon('battery'), ['computer-laptop-symbolic', 'computer-symbolic']);
    assert.deepEqual(batteryIcon('mouse'), ['input-mouse-symbolic']);
    assert.deepEqual(batteryIcon('headset'), ['audio-headset-symbolic', 'audio-headphones-symbolic']);
    assert.deepEqual(batteryIcon('keyboard'), ['input-keyboard-symbolic']);
    assert.deepEqual(batteryIcon('something-new'), ['battery-symbolic']);
});
