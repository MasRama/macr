import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appearanceAt, phaseKey, themeCandidates } from '../../src/features/appearance/logic/appearance.js';

test('light from sunrise to sunset, dark at night', () => {
    assert.equal(appearanceAt(12, 6, 18), 'light');
    assert.equal(appearanceAt(6, 6, 18), 'light');
    assert.equal(appearanceAt(5.99, 6, 18), 'dark');
    assert.equal(appearanceAt(18, 6, 18), 'dark');
    assert.equal(appearanceAt(23.5, 5.5, 17.75), 'dark');
});

test('the night after sunset and the early morning are the same phase', () => {
    // Day 100, 22:00 and day 101, 03:00 are one night.
    assert.equal(phaseKey(100, 22, 6, 18), phaseKey(101, 3, 6, 18));
    assert.equal(phaseKey(100, 22, 6, 18), '100:dark');
    assert.equal(phaseKey(101, 12, 6, 18), '101:light');
    assert.notEqual(phaseKey(101, 12, 6, 18), phaseKey(101, 19, 6, 18));
});

test('a theme swaps its Dark and Light variants', () => {
    assert.deepEqual(themeCandidates('MacTahoe-Dark', false), ['MacTahoe-Light', 'MacTahoe']);
    assert.deepEqual(themeCandidates('MacTahoe-Light', true), ['MacTahoe-Dark']);
    assert.deepEqual(themeCandidates('MacTahoe-Dark-solid', false), ['MacTahoe-Light-solid', 'MacTahoe-solid']);
    assert.deepEqual(themeCandidates('ZorinBlue-Light', true), ['ZorinBlue-Dark']);
    assert.deepEqual(themeCandidates('Yaru-dark', false), ['Yaru-light', 'Yaru']);
    assert.deepEqual(themeCandidates('Yaru', true), ['Yaru-Dark', 'Yaru-dark']);
});

test('a theme already in the wanted variant, or none, stays', () => {
    assert.deepEqual(themeCandidates('MacTahoe-Dark', true), []);
    assert.deepEqual(themeCandidates('ZorinBlue-Light', false), []);
    assert.deepEqual(themeCandidates('Yaru', false), []);
    assert.deepEqual(themeCandidates('', true), []);
    // "Darkness" is a name, not a variant.
    assert.deepEqual(themeCandidates('Darkness', false), []);
});
