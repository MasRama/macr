import assert from 'node:assert/strict';
import { test } from 'node:test';

import { definitionUrl, isWord, parseDefinition, parseSuggestions, searchUrl, suggestUrl } from '../../src/features/spotlight/logic/web.js';

test('reads search suggestions, without the query itself', () => {
    const json = '["gnome she",["gnome shell","gnome she","gnome shell extensions","gnome shell theme"],[],{}]';
    assert.deepEqual(parseSuggestions(json, 'gnome she', 2), ['gnome shell', 'gnome shell extensions']);
    assert.deepEqual(parseSuggestions('["10 km to mi",["= 6.21371192 miles","10 km to miles"]]', '10 km to mi', 3), ['10 km to miles']);
    assert.deepEqual(parseSuggestions('{}', 'x', 3), []);
    assert.deepEqual(parseSuggestions('nope', 'x', 3), []);
});

test("reads a word's first definitions", () => {
    const json = JSON.stringify([
        {
            word: 'serendipity',
            phonetic: '/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/',
            meanings: [
                { partOfSpeech: 'noun', definitions: [{ definition: 'An unsought, unintended, and/or unexpected, but fortunate, discovery.' }, { definition: 'Second one.' }] },
                { partOfSpeech: 'verb', definitions: [{ definition: 'Made up.' }] },
            ],
        },
    ]);
    assert.deepEqual(parseDefinition(json), {
        word: 'serendipity',
        phonetic: '/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/',
        partOfSpeech: 'noun',
        definition: 'An unsought, unintended, and/or unexpected, but fortunate, discovery.',
    });
    assert.equal(parseDefinition('{"title":"No Definitions Found"}'), null);
    assert.equal(parseDefinition('[]'), null);
    assert.equal(parseDefinition('<html>'), null);
});

test('only a single word is looked up in the dictionary', () => {
    assert.equal(isWord(['serendipity']), true);
    assert.equal(isWord(["don't"]), true);
    assert.equal(isWord(['well-being']), true);
    assert.equal(isWord(['a']), false);
    assert.equal(isWord(['two', 'words']), false);
    assert.equal(isWord(['10km']), false);
    assert.equal(isWord(['~/Documents']), false);
});

test('builds the URLs with the query encoded', () => {
    assert.equal(searchUrl('c++ & rust'), 'https://www.google.com/search?q=c%2B%2B%20%26%20rust');
    assert.equal(suggestUrl('gnome she'), 'https://suggestqueries.google.com/complete/search?client=firefox&q=gnome%20she');
    assert.equal(definitionUrl('Serendipity'), 'https://api.dictionaryapi.dev/api/v2/entries/en/serendipity');
});
