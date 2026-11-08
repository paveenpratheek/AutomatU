import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, hexDistance } from './layout.js';

const places = [
  ...Array.from({ length: 12 }, (_, i) => ({ region: 'a' + i, sections: ['A'] })),
  ...Array.from({ length: 8 }, (_, i) => ({ region: 'b' + i, sections: ['B'] })),
  { region: 'ab', sections: ['A', 'B'] },
  { region: 'wait', sections: [] },
];

test('every placed region gets its own cell, a waiting one gets none', () => {
  const { cells } = layout(places);
  assert.equal(cells.length, 21);
  assert.equal(new Set(cells.map((c) => c.q + ',' + c.r)).size, 21);
  assert.ok(!cells.some((c) => c.region === 'wait'));
});

test('a shared region sits between its sections, nearer the middle than the clusters', () => {
  const { cells, centres } = layout(places);
  const ab = cells.find((c) => c.region === 'ab');
  const apart = hexDistance(centres.A, centres.B);
  assert.ok(hexDistance(ab, centres.A) < apart && hexDistance(ab, centres.B) < apart);
});

test('a cluster is a compact patch around its centre', () => {
  const { cells, centres } = layout(places);
  for (const c of cells.filter((x) => x.sections.length === 1 && x.sections[0] === 'A')) assert.ok(hexDistance(c, centres.A) <= 3);
});

test('an empty map lays out nothing', () => {
  assert.deepEqual(layout([]).cells, []);
});
