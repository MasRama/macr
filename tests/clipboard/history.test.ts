import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addClip, ageOf, type ClipMeta, clipKind, MAX_AGE_MS, MAX_CLIPS, MAX_IMAGES, pasteKeys, previewText, pruneClips, searchClips } from '../../src/features/clipboard/logic/history.js';

const text = (value: string, at: number): ClipMeta => ({ key: `t:${value}`, kind: 'text', text: value, at });
const image = (id: string, at: number): ClipMeta => ({ key: `i:${id}`, kind: 'image', text: '', at });

test('a new copy goes first, and copying the same again moves it up', () => {
    let list: ClipMeta[] = [];
    list = addClip(list, text('a', 1), 1);
    list = addClip(list, text('b', 2), 2);
    list = addClip(list, text('a', 3), 3);
    assert.deepEqual(
        list.map((clip) => [clip.text, clip.at]),
        [
            ['a', 3],
            ['b', 2],
        ],
    );
});

test('copies older than eight hours go, as on macOS', () => {
    const list = [text('new', MAX_AGE_MS), text('old', 0)];
    assert.deepEqual(
        pruneClips(list, MAX_AGE_MS + 1).map((clip) => clip.text),
        ['new'],
    );
    assert.deepEqual(
        addClip(list, text('newer', MAX_AGE_MS + 5), MAX_AGE_MS + 5).map((clip) => clip.text),
        ['newer', 'new'],
    );
});

test('the history keeps a few images and a longer list in all', () => {
    let list: ClipMeta[] = [];
    for (let at = 0; at < MAX_IMAGES + 3; at++) list = addClip(list, image(`${at}`, at), at);
    assert.equal(list.length, MAX_IMAGES);
    assert.equal(list[0].key, `i:${MAX_IMAGES + 2}`);
    for (let at = 100; at < 100 + MAX_CLIPS + 5; at++) list = addClip(list, text(`${at}`, at), at);
    assert.equal(list.length, MAX_CLIPS);
    assert.equal(list[0].text, `${100 + MAX_CLIPS + 4}`);
});

test('search finds text, ignoring case and spacing; images only without a query', () => {
    const list = [text('Hello   World', 3), image('x', 2), text('second line\nfoo', 1)];
    assert.deepEqual(
        searchClips(list, '').map((clip) => clip.key),
        ['t:Hello   World', 'i:x', 't:second line\nfoo'],
    );
    assert.deepEqual(
        searchClips(list, 'hello world').map((clip) => clip.key),
        ['t:Hello   World'],
    );
    assert.deepEqual(
        searchClips(list, 'LINE FOO').map((clip) => clip.key),
        ['t:second line\nfoo'],
    );
});

test('what was copied: text first, else an image, and nothing from a password manager', () => {
    assert.deepEqual(clipKind(['text/plain;charset=utf-8', 'image/png']), { kind: 'text' });
    assert.deepEqual(clipKind(['image/jpeg', 'image/png']), { kind: 'image', mimetype: 'image/png' });
    assert.deepEqual(clipKind(['image/webp']), { kind: 'image', mimetype: 'image/webp' });
    assert.equal(clipKind(['text/plain', 'x-kde-passwordManagerHint']), null);
    assert.equal(clipKind(['application/x-thing']), null);
    assert.equal(clipKind([]), null);
});

test('a preview is one tidy line', () => {
    assert.equal(previewText('  first\n\n  second\tthird  '), 'first second third');
    assert.equal(previewText('x'.repeat(500)).length, 200);
});

test('how long ago something was copied', () => {
    const minute = 60_000;
    assert.deepEqual(ageOf(10 * 1000, 0), { unit: 'now', count: 0 });
    assert.deepEqual(ageOf(5 * minute, 0), { unit: 'minutes', count: 5 });
    assert.deepEqual(ageOf(150 * minute, 0), { unit: 'hours', count: 2 });
});

test('terminals paste with Ctrl+Shift+V, everything else with Ctrl+V', () => {
    assert.equal(pasteKeys('gnome-terminal-server'), 'ctrl-shift-v');
    assert.equal(pasteKeys('org.gnome.Ptyxis'), 'ctrl-shift-v');
    assert.equal(pasteKeys('kitty'), 'ctrl-shift-v');
    assert.equal(pasteKeys('org.gnome.Console'), 'ctrl-shift-v');
    assert.equal(pasteKeys('com.mitchellh.ghostty'), 'ctrl-shift-v');
    assert.equal(pasteKeys('org.gnome.TextEditor'), 'ctrl-v');
    assert.equal(pasteKeys(null), 'ctrl-v');
});
