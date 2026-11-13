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
    assert.equal(names.size, 24);
    for (const css of [four, three]) {
        const used = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
        assert.equal(used.length, 30);
        for (const url of used) assert.ok(names.has(url), url);
    }
});

test('Chrome keeps the lights 12px: no light image is bigger than the button it draws', () => {
    // Chrome stretches a background image larger than its 16px-icon button
    // to fill the button, so the images carry their drawn size.
    for (const { name, svg } of lightFiles()) {
        const size = name.endsWith('@2.svg') ? 24 : 12;
        assert.ok(svg.includes(`width="${size}" height="${size}"`), name);
    }
    for (const css of [trafficLightsCss(4), trafficLightsCss(3)]) {
        const images = [...css.matchAll(/background-image: ([^;]+);/g)].map((match) => match[1]);
        for (const image of images) assert.match(image, /^-gtk-scaled\(url\("[^"]+\.svg"\), url\("[^"]+@2\.svg"\)\)$/);
    }
});
