import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutNet, edgeStyle } from './thoughtnet.js';

const order = ['t-a', 't-b', 't-c', 't-d'];
const edges = [{ a: '#', b: 't-a', kind: 'cites' }, { a: '#', b: 't-b', kind: 'commit' }, { a: 't-a', b: 't-c', kind: 'refines' }];

test('the region stays put on the left and every thought lands inside the area', () => {
  const pos = layoutNet(order, edges, 900, 560);
  assert.deepEqual([pos['#'].x, pos['#'].y], [120, 280]);
  for (const id of order) {
    assert.ok(pos[id].x >= 30 && pos[id].x <= 900 - 180, id);
    assert.ok(pos[id].y >= 70 && pos[id].y <= 560 - 30, id);
  }
});

test('the same region always draws the same way', () => {
  assert.deepEqual(layoutNet(order, edges, 900, 560), layoutNet(order, edges, 900, 560));
});

test('a cite is a solid dark line, a commit a thin grey one, a link between thoughts in between', () => {
  assert.equal(edgeStyle('cites').sw, 2);
  assert.equal(edgeStyle('commit').col, '#B9B4A7');
  assert.equal(edgeStyle('refines').sw, 1.5);
});
