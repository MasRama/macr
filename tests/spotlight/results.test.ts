import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutResults, wrapIndex } from '../../src/features/spotlight/logic/results.js';

const group = (id: string, results: string[]) => ({ id, title: id, results });

test('the first app is the top hit and is not repeated', () => {
    const layout = layoutResults([group('files', ['a.txt']), group('applications', ['term', 'text'])]);
    assert.deepEqual(layout.topHit, { providerId: 'applications', item: 'term' });
    assert.deepEqual(
        layout.sections.map((section) => [section.providerId, section.items]),
        [
            ['files', ['a.txt']],
            ['applications', ['text']],
        ],
    );
});

test('without apps the first result of the first provider is the top hit', () => {
    const layout = layoutResults([group('files', []), group('settings', ['wifi', 'sound']), group('calc', ['42'])]);
    assert.deepEqual(layout.topHit, { providerId: 'settings', item: 'wifi' });
    assert.deepEqual(
        layout.sections.map((section) => section.providerId),
        ['settings', 'calc'],
        'empty providers are dropped',
    );
});

test('sections are capped: 6 apps, 4 for the rest', () => {
    const many = (prefix: string) => Array.from({ length: 10 }, (_, index) => `${prefix}${index}`);
    const layout = layoutResults([group('applications', many('app')), group('files', many('file'))]);
    assert.equal(layout.sections[0].items.length, 6);
    assert.equal(layout.sections[1].items.length, 4);
});

test('nothing found means no top hit and no sections', () => {
    assert.deepEqual(layoutResults([group('files', [])]), { topHit: null, sections: [] });
});

test('the selection wraps', () => {
    assert.equal(wrapIndex(0, 1, 3), 1);
    assert.equal(wrapIndex(2, 1, 3), 0);
    assert.equal(wrapIndex(0, -1, 3), 2);
    assert.equal(wrapIndex(-1, 1, 3), 0);
    assert.equal(wrapIndex(0, 1, 0), -1);
});
