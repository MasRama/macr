import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MenuNode, SubmenuNode } from '../../src/features/menubar/logic/app-menus.js';
import { searchMenus, submenuActions } from '../../src/features/menubar/logic/menu-search.js';

const item = (label: string, action: string | null = `app.${label.toLowerCase()}`): MenuNode => ({ kind: 'item', label, action, target: null, accel: '' });
const menu = (label: string, children: MenuNode[], submenuAction: string | null = null): SubmenuNode => ({ kind: 'submenu', label, submenuAction, children });

const MENUS = [
    menu('File', [item('New'), item('Save As…'), { kind: 'section', children: [item('Export as PDF…'), item('Print')] }]),
    menu('Format', [menu('Text', [item('Bold'), item('Underline')], 'win.text-shown'), item('Page Style')]),
    menu('Help', [item('User Guide'), item('About')]),
];

test('an empty search finds nothing', () => {
    assert.deepEqual(searchMenus(MENUS, '  '), []);
});

test('items are found by any part of their label, case and ellipsis aside, with the menus that lead to them', () => {
    const found = searchMenus(MENUS, 'pdf');
    assert.deepEqual(found.map((each) => [each.label, each.path]), [['Export as PDF…', ['File']]]);
    assert.deepEqual(searchMenus(MENUS, 'under').map((each) => each.path), [['Format', 'Text']]);
    assert.deepEqual(searchMenus(MENUS, 'save as...').map((each) => each.label), ['Save As…']);
});

test('every word must match, and labels that start with the search come first', () => {
    assert.deepEqual(searchMenus(MENUS, 'as pdf').map((each) => each.label), ['Export as PDF…']);
    assert.deepEqual(searchMenus(MENUS, 'p').map((each) => each.label), ['Print', 'Page Style', 'Export as PDF…']);
});

test('items with no action cannot be picked and are left out; so is Help, which holds the search', () => {
    const menus = [menu('Edit', [item('Paste', null), item('Paste Special')]), ...MENUS];
    assert.deepEqual(searchMenus(menus, 'paste').map((each) => each.label), ['Paste Special']);
    assert.deepEqual(searchMenus(MENUS, 'guide'), []);
});

test('results stop at the limit', () => {
    assert.equal(searchMenus(MENUS, 'e', 2).length, 2);
});

test('the actions that fill submenus, so menus an app fills only when shown can be searched', () => {
    assert.deepEqual(submenuActions(MENUS), ['win.text-shown']);
});
