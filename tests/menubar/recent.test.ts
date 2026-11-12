import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recentFiles } from '../../src/features/menubar/logic/recent.js';

const xbel = `<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0">
  <bookmark href="file:///home/u/old.txt" added="2026-01-01T00:00:00Z" modified="2026-01-01T00:00:00Z" visited="2026-01-01T00:00:00Z">
  </bookmark>
  <bookmark href="file:///home/u/My%20Report.odt" added="2026-03-01T00:00:00Z" modified="2026-03-02T10:00:00.5Z" visited="2026-03-01T00:00:00Z">
  </bookmark>
  <bookmark href="sftp://host/remote.txt" added="2026-04-01T00:00:00Z" modified="2026-04-01T00:00:00Z" visited="2026-04-01T00:00:00Z">
  </bookmark>
  <bookmark href="file:///home/u/new.png" added="2026-02-01T00:00:00Z" modified="2026-02-01T00:00:00Z" visited="2026-02-01T00:00:00Z">
  </bookmark>
</xbel>`;

test('local files, newest first, with decoded names', () => {
    assert.deepEqual(recentFiles(xbel, 10), [
        { uri: 'file:///home/u/My%20Report.odt', name: 'My Report.odt' },
        { uri: 'file:///home/u/new.png', name: 'new.png' },
        { uri: 'file:///home/u/old.txt', name: 'old.txt' },
    ]);
});

test('limit keeps the newest', () => {
    assert.deepEqual(recentFiles(xbel, 1).map((f) => f.name), ['My Report.odt']);
});

test('broken input gives nothing', () => {
    assert.deepEqual(recentFiles('not xml', 10), []);
});
