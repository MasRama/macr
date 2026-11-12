import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accelLabel, arrangeMenus, groupEntries, readMenu, stripMnemonic, type MenuNode, type MenuReader } from '../../src/features/menubar/logic/app-menus.js';

/** A fake GMenuModel: each entry is attributes plus optional links. */
type FakeItem = { attrs: Record<string, string>; section?: FakeItem[]; submenu?: FakeItem[] };
type Fake = FakeItem[];

function reader(items: Fake): MenuReader {
    return {
        count: () => items.length,
        attribute: (i, name) => items[i].attrs[name] ?? null,
        link: (i, name) => {
            const linked = name === 'section' ? items[i].section : name === 'submenu' ? items[i].submenu : undefined;
            return linked ? reader(linked) : null;
        },
    };
}

test('mnemonics are taken out of labels, a doubled underscore stays', () => {
    assert.equal(stripMnemonic('_File'), 'File');
    assert.equal(stripMnemonic('F_ormat'), 'Format');
    assert.equal(stripMnemonic('Save __As'), 'Save _As');
    assert.equal(stripMnemonic('Plain'), 'Plain');
});

test('accelerators read as macOS key symbols', () => {
    assert.equal(accelLabel('<Primary>o'), '⌃O');
    assert.equal(accelLabel('<Control><Shift>s'), '⌃⇧S');
    assert.equal(accelLabel('<Alt>F4'), '⌥F4');
    assert.equal(accelLabel('<Super>space'), '⌘Space');
    assert.equal(accelLabel('<Primary>plus'), '⌃+');
    assert.equal(accelLabel('Delete'), '⌦');
    assert.equal(accelLabel(''), '');
    assert.equal(accelLabel(null), '');
});

test('hidden-when rules that need live actions are kept on the item', () => {
    const [node] = readMenu(reader([{ attrs: { label: 'Paste', action: 'win.paste', 'hidden-when': 'action-disabled' } }]));
    assert.equal(node.kind === 'item' && node.hiddenWhen, 'action-disabled');
});

test('a model is read into items, sections and submenus', () => {
    const tree = readMenu(reader([
        { attrs: { label: '_File', 'submenu-action': 'win.file' }, submenu: [
            { attrs: {}, section: [
                { attrs: { label: '_Open...', action: 'win.open', accel: '<Primary>o' } },
                { attrs: { label: 'Recent', 'submenu-action': 'win.recent' }, submenu: [] },
            ] },
            { attrs: {}, section: [{ attrs: { label: 'Quit', action: 'app.quit' } }] },
        ] },
    ]));
    assert.deepEqual(tree, [{
        kind: 'submenu', label: 'File', submenuAction: 'win.file', children: [
            { kind: 'section', children: [
                { kind: 'item', label: 'Open...', action: 'win.open', target: null, accel: '⌃O' },
                { kind: 'submenu', label: 'Recent', submenuAction: 'win.recent', children: [] },
            ] },
            { kind: 'section', children: [{ kind: 'item', label: 'Quit', action: 'app.quit', target: null, accel: '' }] },
        ],
    }]);
});

test('items hidden in a macOS menu bar, and items with no label, are left out', () => {
    const tree = readMenu(reader([
        { attrs: { label: 'Preferences', action: 'app.prefs', 'hidden-when': 'macos-menubar' } },
        { attrs: { action: 'app.nothing' } },
        { attrs: { label: 'Keep', action: 'app.keep', target: "'x'" } },
    ]));
    assert.deepEqual(tree, [{ kind: 'item', label: 'Keep', action: 'app.keep', target: "'x'", accel: '' }]);
});

const menu = (label: string): MenuNode => ({ kind: 'submenu', label, submenuAction: null, children: [] });

test('top-level menus come out of nested sections; Window is folded into Macr\'s, Help goes last', () => {
    const tree: MenuNode[] = [{ kind: 'section', children: [{ kind: 'section', children: [
        menu('File'), menu('Edit'), menu('Window'), menu('Help'),
    ] }] }];
    const { menus, help } = arrangeMenus(tree);
    assert.deepEqual(menus.map((m) => m.label), ['File', 'Edit']);
    assert.equal(help?.label, 'Help');
});

test('the same menus exported twice show once', () => {
    const tree: MenuNode[] = [
        { kind: 'section', children: [menu('File'), menu('Edit')] },
        { kind: 'section', children: [menu('File'), menu('Edit')] },
    ];
    assert.deepEqual(arrangeMenus(tree).menus.map((m) => m.label), ['File', 'Edit']);
});

test('an app with no menus gives none', () => {
    assert.deepEqual(arrangeMenus([]), { menus: [], help: null });
    assert.deepEqual(arrangeMenus([{ kind: 'item', label: 'Lone', action: 'app.x', target: null, accel: '' }]), { menus: [], help: null });
});

const item = (label: string): MenuNode => ({ kind: 'item', label, action: null, target: null, accel: '' });

test('sections become groups, however deeply nested, and empty ones go', () => {
    const groups = groupEntries([
        item('Loose'),
        { kind: 'section', children: [item('A'), { kind: 'section', children: [item('B')] }, item('C')] },
        { kind: 'section', children: [] },
        { kind: 'section', children: [item('D')] },
        item('E'),
    ]);
    assert.deepEqual(groups.map((group) => group.map((node) => node.label)), [['Loose'], ['A'], ['B'], ['C'], ['D'], ['E']]);
});
