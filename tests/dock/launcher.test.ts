import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appIdOf, badgeText, EMPTY_ENTRY, mergeEntry, progressOf } from '../../src/features/dock/logic/launcher.js';

test('an app uri names the app by its desktop file', () => {
    assert.equal(appIdOf('application://org.telegram.desktop.desktop'), 'org.telegram.desktop.desktop');
    assert.equal(appIdOf('application://firefox.desktop'), 'firefox.desktop');
    assert.equal(appIdOf('firefox.desktop'), 'firefox.desktop');
    assert.equal(appIdOf('application://'), null);
    assert.equal(appIdOf(''), null);
});

test('an update changes only the keys it carries', () => {
    const counted = mergeEntry(EMPTY_ENTRY, { count: 3, 'count-visible': true });
    assert.deepEqual(counted, { count: 3, countVisible: true, progress: 0, progressVisible: false, urgent: false });
    const progressing = mergeEntry(counted, { progress: 0.4, 'progress-visible': true, unknown: 'x' });
    assert.deepEqual(progressing, { count: 3, countVisible: true, progress: 0.4, progressVisible: true, urgent: false });
    // Values of the wrong type are ignored.
    assert.deepEqual(mergeEntry(progressing, { count: 'many', urgent: 1 }), progressing);
    assert.equal(mergeEntry(EMPTY_ENTRY, { urgent: true }).urgent, true);
});

test('the badge shows a visible count above zero, shortened past 999', () => {
    const entry = (count: number, countVisible = true) => ({ ...EMPTY_ENTRY, count, countVisible });
    assert.equal(badgeText(entry(3)), '3');
    assert.equal(badgeText(entry(999)), '999');
    assert.equal(badgeText(entry(1500)), '999+');
    assert.equal(badgeText(entry(0)), null);
    assert.equal(badgeText(entry(-2)), null);
    assert.equal(badgeText(entry(5, false)), null);
    assert.equal(badgeText(entry(2.7)), '2');
});

test('the progress bar shows a visible progress, kept between 0 and 1', () => {
    const entry = (progress: number, progressVisible = true) => ({ ...EMPTY_ENTRY, progress, progressVisible });
    assert.equal(progressOf(entry(0.25)), 0.25);
    assert.equal(progressOf(entry(1.4)), 1);
    assert.equal(progressOf(entry(-1)), 0);
    assert.equal(progressOf(entry(Number.NaN)), 0);
    assert.equal(progressOf(entry(0.5, false)), null);
});
