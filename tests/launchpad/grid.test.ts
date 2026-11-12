import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gridShape, moveSelection, paginate } from '../../src/features/launchpad/logic/grid.js';

test('a big monitor gets at most 7 columns and 5 rows', () => {
    assert.deepEqual(gridShape(2560, 1440), { columns: 7, rows: 5, perPage: 35 });
});

test('a laptop screen fits fewer cells', () => {
    const shape = gridShape(1536, 864);
    assert.equal(shape.columns, 7);
    assert.equal(shape.rows, 4);
    assert.equal(shape.perPage, 28);
});

test('a tiny screen still gets one cell', () => {
    assert.deepEqual(gridShape(100, 100), { columns: 1, rows: 1, perPage: 1 });
});

test('items split into full pages and a last one', () => {
    assert.deepEqual(paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(paginate([], 4), [[]], 'always one page');
});

test('arrows move inside the grid and across pages', () => {
    const shape = { columns: 3, rows: 2, perPage: 6 };
    const count = 8;
    assert.equal(moveSelection(0, 'right', count, shape), 1);
    assert.equal(moveSelection(0, 'left', count, shape), 0, 'stays at the first');
    assert.equal(moveSelection(7, 'right', count, shape), 7, 'stays at the last');
    assert.equal(moveSelection(5, 'right', count, shape), 6, 'next page');
    assert.equal(moveSelection(6, 'left', count, shape), 5, 'previous page');
    assert.equal(moveSelection(1, 'down', count, shape), 4);
    assert.equal(moveSelection(4, 'down', count, shape), 4, 'bottom row of the page');
    assert.equal(moveSelection(4, 'up', count, shape), 1);
    assert.equal(moveSelection(1, 'up', count, shape), 1, 'top row');
    assert.equal(moveSelection(6, 'down', count, shape), 6, 'nothing below on the last page');
});

test('no selection starts at the first item', () => {
    assert.equal(moveSelection(-1, 'right', 5, { columns: 3, rows: 2, perPage: 6 }), 0);
    assert.equal(moveSelection(-1, 'down', 0, { columns: 3, rows: 2, perPage: 6 }), -1);
});
