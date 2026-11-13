import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ACTIONS_PROVIDER,
    ALL_APPS_PROVIDER,
    alphabetical,
    dropRepeats,
    escapeStep,
    FREQUENT_PROVIDER,
    isFileProvider,
    isSystemAction,
    matchesTerms,
    matchItems,
    RECENT_PROVIDER,
    repeatKey,
    viewForKey,
    viewProviders,
} from '../../src/features/spotlight/logic/views.js';
import { APPS_PROVIDER, layoutResults } from '../../src/features/spotlight/logic/results.js';

const gnome = [APPS_PROVIDER, 'org.gnome.Nautilus.desktop', 'org.gnome.Settings.desktop', 'org.gnome.Calculator.desktop'];

test('digits 1 to 4 open the views, the same digit goes back to everything', () => {
    assert.equal(viewForKey(1, 'all'), 'apps');
    assert.equal(viewForKey(2, 'apps'), 'files');
    assert.equal(viewForKey(3, 'all'), 'actions');
    assert.equal(viewForKey(4, 'all'), 'clipboard');
    assert.equal(viewForKey(1, 'apps'), 'all');
    assert.equal(viewForKey(0, 'all'), null);
    assert.equal(viewForKey(5, 'all'), null);
});

test('Esc clears the text, then leaves the view, then closes', () => {
    assert.equal(escapeStep('fire', 'apps'), 'clear');
    assert.equal(escapeStep('', 'apps'), 'leave');
    assert.equal(escapeStep('', 'all'), 'close');
    assert.equal(escapeStep('fire', 'all'), 'clear');
});

test('file providers are told apart by their app id', () => {
    assert.ok(isFileProvider('org.gnome.Nautilus.desktop'));
    assert.ok(isFileProvider('org.freedesktop.LocalSearch3.desktop'));
    assert.ok(isFileProvider('org.freedesktop.Tracker3.Miner.Files.desktop'));
    assert.ok(!isFileProvider('org.gnome.Settings.desktop'));
    assert.ok(!isFileProvider(APPS_PROVIDER));
});

test('everything: no results for an empty field, actions after the apps', () => {
    assert.deepEqual(viewProviders('all', true, gnome), []);
    assert.deepEqual(viewProviders('all', false, gnome), ['macr-convert', APPS_PROVIDER, ACTIONS_PROVIDER, 'org.gnome.Nautilus.desktop', 'org.gnome.Settings.desktop', 'org.gnome.Calculator.desktop', 'macr-define', 'macr-web']);
    assert.deepEqual(viewProviders('all', false, ['org.gnome.Settings.desktop']), ['macr-convert', ACTIONS_PROVIDER, 'org.gnome.Settings.desktop', 'macr-define', 'macr-web']);
});

test('views keep only their own providers', () => {
    assert.deepEqual(viewProviders('apps', false, gnome), [APPS_PROVIDER]);
    assert.deepEqual(viewProviders('apps', true, gnome), [FREQUENT_PROVIDER, ALL_APPS_PROVIDER]);
    assert.deepEqual(viewProviders('files', false, gnome), [RECENT_PROVIDER, 'org.gnome.Nautilus.desktop']);
    assert.deepEqual(viewProviders('files', true, gnome), [RECENT_PROVIDER]);
    assert.deepEqual(viewProviders('actions', false, gnome), [ACTIONS_PROVIDER]);
    assert.deepEqual(viewProviders('actions', true, gnome), [ACTIONS_PROVIDER]);
    assert.deepEqual(viewProviders('clipboard', false, gnome), []);
});

test('terms match the start of any word, in any case and order', () => {
    assert.ok(matchesTerms('Empty Trash', ['tra']));
    assert.ok(matchesTerms('Empty Trash', ['TRASH', 'emp']));
    assert.ok(matchesTerms('New Private Window — Firefox', ['priv', 'fire']));
    assert.ok(!matchesTerms('Empty Trash', ['rash']));
    assert.ok(!matchesTerms('Empty Trash', ['trash', 'bin']));
    assert.ok(matchesTerms('Do Not Disturb', []));
    assert.ok(matchesTerms('Résumé.pdf', ['resu']), 'accents do not get in the way');
    assert.ok(matchesTerms('my_report-2026.pdf', ['report', '2026']));
});

test('items match on their name or keywords, at most max', () => {
    const items = [
        { id: 'dark', name: 'Dark Mode', keywords: ['appearance', 'theme'] },
        { id: 'trash', name: 'Empty Trash', keywords: ['bin'] },
        { id: 'mc', name: 'Mission Control', keywords: ['overview', 'windows'] },
    ];
    assert.deepEqual(
        matchItems(items, ['the']).map((item) => item.id),
        ['dark'],
    );
    assert.deepEqual(
        matchItems(items, ['bin']).map((item) => item.id),
        ['trash'],
    );
    assert.deepEqual(
        matchItems(items, []).map((item) => item.id),
        ['dark', 'trash', 'mc'],
    );
    assert.equal(matchItems(items, [], 2).length, 2);
});

test('apps A to Z ignore case and accents', () => {
    assert.deepEqual(alphabetical(['files', 'Écran', 'Calendar', 'about'], (name) => name), ['about', 'Calendar', 'Écran', 'files']);
});

test('views list every result without a Top Hit', () => {
    const many = Array.from({ length: 12 }, (_, at) => `app${at}`);
    const layout = layoutResults([{ id: APPS_PROVIDER, title: 'Apps', results: many }], { topHit: false, capped: false });
    assert.equal(layout.topHit, null);
    assert.deepEqual(layout.sections[0].items, many);
});

test('a file listed twice shows only in the first section', () => {
    const groups = [
        { id: 'recent', title: 'Recent', results: ['file:///a', 'file:///b'] },
        { id: 'files', title: 'Files', results: ['file:///b', 'file:///c', 'x', 'x'] },
    ];
    const kept = dropRepeats(groups, (item: string) => (item.startsWith('file://') ? item : null));
    assert.deepEqual(
        kept.map((group) => group.results),
        [
            ['file:///a', 'file:///b'],
            ['file:///c', 'x', 'x'],
        ],
    );
});

test('a system action the app provider lists is the same as Macr\'s', () => {
    assert.equal(repeatKey(APPS_PROVIDER, 'lock-screen'), 'system:lock-screen');
    assert.equal(repeatKey(ACTIONS_PROVIDER, 'system:lock-screen'), 'system:lock-screen');
    assert.equal(repeatKey(APPS_PROVIDER, 'org.gnome.Clocks.desktop'), null);
    assert.equal(repeatKey(ACTIONS_PROVIDER, 'macr:dark-mode'), null);
    assert.equal(repeatKey('org.gnome.Nautilus.desktop', 'file:///a'), 'file:///a');
    assert.ok(isSystemAction('power-off'));
    assert.ok(!isSystemAction('org.gnome.Clocks.desktop'));
});
