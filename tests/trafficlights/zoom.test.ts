import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drawsLights, glyphParts, greenLightZone, inside } from '../../src/features/trafficlights/logic/zoom.js';

const frame = { x: 610, y: 294, width: 700, height: 520 };

test('the green light sits third from the left in the title bar', () => {
    const zone = greenLightZone(frame);
    // Measured centres: libadwaita 55.5, 22.5 from the frame; GTK 3 52.5, 21.5.
    assert.equal(inside(zone, 610 + 55, 294 + 22), true);
    assert.equal(inside(zone, 610 + 52, 294 + 21), true);
    // The yellow light, 20 px to the left, is not it.
    assert.equal(inside(zone, 610 + 35, 294 + 22), false);
    assert.equal(inside(zone, 610 + 55, 294 + 40), false);
});

test('only windows that draw Macr\'s lights get the menu', () => {
    const gtk = { normal: true, fullscreen: false, gtk: true, x11Framed: false };
    assert.equal(drawsLights(gtk), true);
    assert.equal(drawsLights({ ...gtk, gtk: false, x11Framed: true }), true);
    // Chrome, Electron and Qt apps draw their own buttons elsewhere.
    assert.equal(drawsLights({ ...gtk, gtk: false }), false);
    assert.equal(drawsLights({ ...gtk, fullscreen: true }), false);
    assert.equal(drawsLights({ ...gtk, normal: false }), false);
});

test('a menu glyph shows the window\'s part of the screen, and its partner\'s', () => {
    assert.deepEqual(glyphParts('left', 24, 16, 2), [{ x: 2, y: 2, width: 9, height: 12 }]);
    assert.deepEqual(glyphParts('fill', 24, 16, 2), [{ x: 2, y: 2, width: 20, height: 12 }]);
    assert.deepEqual(glyphParts('right-left', 24, 16, 2), [
        { x: 13, y: 2, width: 9, height: 12 },
        { x: 2, y: 2, width: 9, height: 12 },
    ]);
    assert.deepEqual(glyphParts('top-bottom', 24, 16, 2), [
        { x: 2, y: 2, width: 20, height: 5 },
        { x: 2, y: 9, width: 20, height: 5 },
    ]);
});
