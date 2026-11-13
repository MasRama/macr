import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedApps, allows, bannersFor, isFocusMode, modeForBanners, parseSchedules, scheduledMode, scheduleStep, withAllowed, withSchedule } from '../../src/features/controlcenter/logic/focus.js';

test('only the four macOS modes are modes', () => {
    assert.ok(isFocusMode('dnd'));
    assert.ok(isFocusMode('sleep'));
    assert.ok(!isFocusMode(''));
    assert.ok(!isFocusMode('gaming'));
});

const allowed = ['work:org.gnome.Calendar.desktop', 'work:slack.desktop', 'sleep:org.gnome.Clocks.desktop', 'junk'];

test('allowed apps are kept per mode', () => {
    assert.deepEqual(allowedApps(allowed, 'work'), ['org.gnome.Calendar.desktop', 'slack.desktop']);
    assert.deepEqual(allowedApps(allowed, 'dnd'), []);
    assert.deepEqual(withAllowed(allowed, 'dnd', 'slack.desktop', true), [...allowed, 'dnd:slack.desktop']);
    assert.deepEqual(withAllowed(allowed, 'work', 'slack.desktop', false), ['work:org.gnome.Calendar.desktop', 'sleep:org.gnome.Clocks.desktop', 'junk']);
    assert.deepEqual(withAllowed(allowed, 'work', 'slack.desktop', true), allowed, 'no repeats');
});

test('a notification source is allowed by its app id, with or without .desktop', () => {
    assert.ok(allows(allowed, 'work', 'slack'));
    assert.ok(allows(allowed, 'work', 'org.gnome.Calendar'));
    assert.ok(allows(allowed, 'work', 'slack.desktop'));
    assert.ok(!allows(allowed, 'work', 'org.gnome.Clocks'));
    assert.ok(!allows(allowed, 'work', 'generic'));
});

test('GNOME’s Do Not Disturb follows Focus, and the other way round', () => {
    assert.equal(bannersFor(''), true);
    assert.equal(bannersFor('work'), false);
    assert.equal(modeForBanners(false, ''), 'dnd', 'GNOME’s own switch turns Focus on');
    assert.equal(modeForBanners(true, 'work'), '', 'and off');
    assert.equal(modeForBanners(false, 'sleep'), null, 'already agree');
    assert.equal(modeForBanners(true, ''), null);
});

const schedules = parseSchedules(['sleep=on,22:00,07:00', 'work=on,09:00,17:30', 'personal=off,18:00,20:00', 'bad=on,1,2', 'dnd=on,25:00,07:00']);

test('schedules are read, bad ones dropped', () => {
    assert.deepEqual(schedules, [
        { mode: 'sleep', on: true, start: 22 * 60, end: 7 * 60 },
        { mode: 'work', on: true, start: 9 * 60, end: 17 * 60 + 30 },
        { mode: 'personal', on: false, start: 18 * 60, end: 20 * 60 },
    ]);
});

test('the scheduled mode at a time of day, over midnight too', () => {
    assert.equal(scheduledMode(schedules, 23 * 60), 'sleep');
    assert.equal(scheduledMode(schedules, 3 * 60), 'sleep');
    assert.equal(scheduledMode(schedules, 7 * 60), null, 'the end is not inside');
    assert.equal(scheduledMode(schedules, 9 * 60), 'work');
    assert.equal(scheduledMode(schedules, 19 * 60), null, 'a schedule that is off');
});

test('a schedule turns its mode on at the start and off at the end', () => {
    assert.equal(scheduleStep(null, 'sleep', ''), 'sleep');
    assert.equal(scheduleStep('sleep', null, 'sleep'), '');
    assert.equal(scheduleStep('work', 'sleep', 'work'), 'sleep');
});

test('a mode turned off or changed by hand stays so until the next start', () => {
    assert.equal(scheduleStep('sleep', 'sleep', ''), null, 'turned off during the window');
    assert.equal(scheduleStep('sleep', null, 'dnd'), null, 'changed by hand: the end leaves it');
    assert.equal(scheduleStep(null, null, 'dnd'), null);
});

test('a schedule is saved in its place', () => {
    const saved = ['sleep=off,22:00,07:00'];
    assert.deepEqual(withSchedule(saved, { mode: 'sleep', on: true, start: 23 * 60 + 30, end: 6 * 60 }), ['sleep=on,23:30,06:00']);
    assert.deepEqual(withSchedule(saved, { mode: 'work', on: true, start: 9 * 60, end: 17 * 60 }), ['sleep=off,22:00,07:00', 'work=on,09:00,17:00']);
});
