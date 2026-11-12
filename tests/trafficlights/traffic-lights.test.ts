import assert from 'node:assert/strict';
import { test } from 'node:test';

import { macLayout } from '../../src/features/trafficlights/logic/layout.js';
import { ASSETS, IMPORT, lightFiles, lightSvg, trafficLightsCss, withImport, withoutImport } from '../../src/features/trafficlights/logic/stylesheet.js';

test('the traffic lights go first on the left, other buttons keep their side', () => {
    assert.equal(macLayout('appmenu:minimize,maximize,close'), 'close,minimize,maximize,appmenu:');
    assert.equal(macLayout('close,minimize,maximize:appmenu'), 'close,minimize,maximize:appmenu');
    assert.equal(macLayout('icon:close'), 'close,minimize,maximize,icon:');
    assert.equal(macLayout(':'), 'close,minimize,maximize:');
    assert.equal(macLayout('menu,close'), 'close,minimize,maximize,menu:');
    assert.equal(macLayout(' close , maximize :spacer'), 'close,minimize,maximize:spacer');
});

test('a macOS layout stays as it is', () => {
    const layout = macLayout('appmenu:close');
    assert.equal(macLayout(layout), layout);
});

test('no gtk.css: one is made with the import, and goes again after', () => {
    const text = withImport({ kind: 'missing' });
    assert.equal(text, `${IMPORT}\n`);
    assert.deepEqual(withoutImport(text), { kind: 'missing' });
});

test('a gtk.css of the user gets the import first, once, and is given back unchanged', () => {
    const own = '@import "../macos-like-window-controls/gtk-3.0.css";\n';
    const text = withImport({ kind: 'file', text: own });
    assert.equal(text, `${IMPORT}\n${own}`);
    assert.equal(withImport({ kind: 'file', text }), text);
    assert.deepEqual(withoutImport(text), { kind: 'file', text: own });
});

test('a gtk.css linked to a theme becomes a file importing the theme, and the link comes back', () => {
    const text = withImport({ kind: 'link', target: '/home/me/.config/gtk-4.0/gtk-Dark.css', uri: 'file:///home/me/.config/gtk-4.0/gtk-Dark.css' });
    assert.ok(text.startsWith(`${IMPORT}\n@import url("file:///home/me/.config/gtk-4.0/gtk-Dark.css");`));
    assert.deepEqual(withoutImport(text), { kind: 'link', target: '/home/me/.config/gtk-4.0/gtk-Dark.css' });
});

test('rules added to a former link are kept, theme import and all', () => {
    const text = `${withImport({ kind: 'link', target: 'gtk-Dark.css' })}window { color: red; }\n`;
    const back = withoutImport(text);
    assert.equal(back.kind, 'file');
    assert.ok(back.kind === 'file' && back.text.includes('gtk-Dark.css') && back.text.includes('color: red') && !back.text.includes(IMPORT));
});

test('a light shows its symbol only on hover or press, and is grey in an unfocused window', () => {
    assert.ok(!lightSvg('close', 'rest').includes('<path'));
    assert.ok(lightSvg('close', 'hover').includes('<path'));
    assert.ok(lightSvg('minimize', 'pressed').includes('#bf8e22'));
    assert.ok(lightSvg('maximize', 'backdrop').includes('#808080'));
    assert.ok(!lightSvg('maximize', 'backdrop').includes('#28c840'));
});

test('GTK 4 styles the windowcontrols group, GTK 3 the loose titlebuttons, above any theme', () => {
    const four = trafficLightsCss(4);
    assert.ok(four.includes('windowcontrols:hover > button.close:not(#macr), windowcontrols > button.close:not(#macr):hover {'));
    assert.ok(four.includes('windowcontrols:hover > button.close:not(#macr):backdrop, windowcontrols > button.close:not(#macr):hover:backdrop {'));
    assert.ok(!four.includes('titlebutton'));
    const three = trafficLightsCss(3);
    assert.ok(three.includes('button.titlebutton.maximize:not(#macr):hover'));
    assert.ok(!three.includes('windowcontrols'));
    const names = new Set(lightFiles().map((file) => `${ASSETS}/${file.name}`));
    assert.equal(names.size, 12);
    for (const css of [four, three]) {
        const used = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
        assert.equal(used.length, 15);
        for (const url of used) assert.ok(names.has(url), url);
    }
});
