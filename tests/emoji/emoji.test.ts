import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMOJI_DATA } from '../../src/features/emoji/logic/data.js';
import { inCategory, parseEmoji, pushRecent, RECENT_MAX, searchEmoji } from '../../src/features/emoji/logic/emoji.js';

const all = parseEmoji(EMOJI_DATA);

test('the data is filed in macOS categories, without skin tones', () => {
    assert.ok(all.length > 1800);
    assert.deepEqual(all[0], { char: '😀', name: 'grinning face', category: 'people' });
    assert.equal(all.find((emoji) => emoji.name === 'dog face')?.category, 'nature');
    assert.equal(all.find((emoji) => emoji.name === 'flag: Indonesia')?.char, '🇮🇩');
    assert.equal(all.some((emoji) => emoji.name.includes('skin tone')), false);
    // Components (skin tone swatches, hair) are not emoji to pick.
    assert.equal(all.some((emoji) => emoji.name === 'red hair'), false);
});

test('search matches the start of each word, best match first', () => {
    const cat = searchEmoji(all, 'cat').map((emoji) => emoji.name);
    assert.deepEqual(cat.slice(0, 2), ['cat', 'cat face']);
    assert.ok(cat.includes('grinning cat'));
    // Not inside a word.
    assert.equal(cat.includes('locomotive'), false);
    assert.deepEqual(searchEmoji(all, 'flag indo').map((emoji) => emoji.char), ['🇮🇩']);
    assert.deepEqual(searchEmoji(all, '  '), []);
    assert.equal(searchEmoji(all, 'face', 5).length, 5);
});

test('a pick moves to the front of Frequently Used', () => {
    assert.deepEqual(pushRecent(['😀', '🐶'], '🐶'), ['🐶', '😀']);
    assert.deepEqual(pushRecent([], '🎉'), ['🎉']);
    const full = Array.from({ length: RECENT_MAX }, (_, index) => String(index));
    assert.equal(pushRecent(full, 'x').length, RECENT_MAX);
    assert.equal(pushRecent(full, 'x').at(-1), String(RECENT_MAX - 2));
});

test('a category lists its emoji; Frequently Used in pick order', () => {
    assert.ok(inCategory(all, 'flags', []).every((emoji) => emoji.category === 'flags'));
    assert.deepEqual(inCategory(all, 'recent', ['🐶', 'gone', '😀']).map((emoji) => emoji.char), ['🐶', '😀']);
});
