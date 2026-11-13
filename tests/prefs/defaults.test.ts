import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const schema = readFileSync('schemas/org.gnome.shell.extensions.macr.gschema.xml', 'utf8');

test('every switch is on by default, so a new user meets all of Macr', () => {
    const switches = [...schema.matchAll(/<key name="([^"]+)" type="b">\s*<default>(\w+)<\/default>/g)];
    assert.ok(switches.length > 30);
    // Keys holding what GNOME had before Macr are memory, not switches.
    const off = switches.filter(([, name, value]) => value !== 'true' && !name.includes('-saved-')).map(([, name]) => name);
    assert.deepEqual(off, []);
});
