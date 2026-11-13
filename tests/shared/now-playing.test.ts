import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickPlayer } from '../../src/shared/logic/now-playing.js';

test('the widget follows the player that is playing, else the last one used', () => {
    const a = { name: 'a', status: 'Paused', changedAt: 30 };
    const b = { name: 'b', status: 'Playing', changedAt: 10 };
    const c = { name: 'c', status: 'Stopped', changedAt: 50 };
    assert.equal(pickPlayer([a, b, c])?.name, 'b');
    assert.equal(pickPlayer([a, c])?.name, 'c');
    assert.equal(pickPlayer([a, { ...b, status: 'Paused', changedAt: 40 }])?.name, 'b');
    assert.equal(pickPlayer([]), null);
});
