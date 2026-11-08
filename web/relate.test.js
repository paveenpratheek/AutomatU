import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf, relationLayout, addressOf, indexRelations } from './relate.js';
import { hd } from './hexmain.js';

const weights = (pairs) => (a, b) => { const p = pairs.find(([x, y]) => (x === a && y === b) || (x === b && y === a)); return p ? p[2] : 0; };
/* Two clusters of three joined through one box, and one box related to nothing. */
const ids = ['a1', 'a2', 'a3', 'B', 'c1', 'c2', 'c3', 'z'];
const w = weights([['a1', 'a2', 1], ['a2', 'a3', 1], ['a1', 'a3', 1], ['a3', 'B', 1], ['B', 'c1', 1], ['c1', 'c2', 1], ['c2', 'c3', 1], ['c1', 'c3', 1]]);

test('a box that joins two clusters is a bridge, and a box related to nothing is alone', () => {
  const g = groupsOf(ids, w);
  assert.deepEqual(Object.keys(g.bridges), ['B']);
  assert.equal(g.bridges.B.length, 2);
  assert.notEqual(g.clusterOf.a1, g.clusterOf.c1);
  assert.equal(g.clusters.find((c) => c.includes('z')).length, 1);
});

test('a group past the cap is split at its weakest relation, so nothing becomes one lump', () => {
  const chain = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const cw = weights([['p1', 'p2', 3], ['p2', 'p3', 3], ['p3', 'p4', 0.5], ['p4', 'p5', 3], ['p5', 'p6', 3]]);
  const g = groupsOf(chain, cw, 3);
  assert.ok(g.units.every((u) => u.length <= 3));
  assert.deepEqual(g.cut.map((e) => [e[0], e[1]]), [['p3', 'p4']]);
});

test('related boxes touch, different clusters never do, the bridge touches both, and the loner stands apart', () => {
  const { cells, groups } = relationLayout(ids, w);
  const touch = (a, b) => hd(cells[a], cells[b]) === 1;
  assert.ok(touch('a1', 'a2') || touch('a1', 'a3'));
  for (const a of groups.clusters[groups.clusterOf.a1]) for (const c of groups.clusters[groups.clusterOf.c1]) assert.ok(!touch(a, c), a + ' touches ' + c);
  assert.ok(groups.clusters[groups.clusterOf.a1].some((a) => touch('B', a)) && groups.clusters[groups.clusterOf.c1].some((c) => touch('B', c)));
  for (const o of ids.filter((x) => x !== 'z')) assert.ok(hd(cells.z, cells[o]) >= 2, 'the loner keeps a hexagon of space');
  const seen = new Set(ids.map((i) => cells[i].join(',')));
  assert.equal(seen.size, ids.length, 'one box per hexagon');
});

test('addresses are written as the server writes them, and relations are found either way round', () => {
  const reg = { c: { kind: 'canvas', parent: 'root' }, t: { kind: 'totem', name: 'Plan', parent: 'c' }, s: { kind: 'sub', name: 'Later', parent: 't' }, b: { kind: 'box', name: 'Agents', parent: 's' } };
  assert.equal(addressOf(reg, 'b'), 'Plan (totem) > Later (sub-totem) > Agents');
  const R = indexRelations({ edges: [{ a: 'x', b: 'y', w: 1, why: ['linked on the canvas'] }], apart: [] });
  assert.equal(R.edge('y', 'x').w, 1);
  assert.equal(R.of('x').length, 1);
});
