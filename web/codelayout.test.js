import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodeMap, regionAt, scopeOf, WAIT } from './codelayout.js';

const A = 'Plan (totem) > 1. Read', B = 'Plan (totem) > 2. Show', C = 'Plan (totem) > 3. Agents';
const places = [], regions = {}, commits = {
  c1: ['2026-11-08', 'feat(reader): read things'], c2: ['2026-11-08', 'feat(view): show things'], c3: ['2026-10-01', 'chore: no scope'],
};
const add = (id, sections, sha, file) => { places.push({ region: id, sections, near: sections.length ? sections : [A], best: A, score: 0.8, margin: 0.05 }); regions[id] = { file, name: id, commits: [sha], thoughts: [] }; };
for (let i = 0; i < 12; i++) add('r' + i, [A], 'c1', 'src/read.py');
for (let i = 0; i < 9; i++) add('v' + i, [B], 'c2', 'web/view.js');
add('both', [A, B], 'c1', 'src/read.py');
for (let i = 0; i < 5; i++) add('w' + i, [], 'c3', 'tools/misc.py');
const cv = { run: { sections: [A, B, C] }, places, regions, commits };

test('a plan box is a group, a commit scope a cluster inside it, and waiting code its own group', () => {
  const m = buildCodeMap(cv);
  assert.deepEqual(m.groups.map((g) => g.name), ['1. Read', '2. Show', WAIT]);
  assert.deepEqual(m.clusters.map((c) => c.name), ['reader', 'view', 'misc.py']);
  assert.equal(m.groups.find((g) => g.wait).size, 5);
});

test('every region gets its own cell, and a shared one links the two clusters', () => {
  const m = buildCodeMap(cv);
  assert.equal(new Set(m.regions.map((r) => r.q + ',' + r.rr)).size, m.regions.length);
  const both = m.regions.find((r) => r.id === 'both');
  assert.equal(both.also.length, 1);
  assert.deepEqual(m.clusters[0].links, [[1, 1]]);
});

test('the same map always lays out the same way, and a point finds its region', () => {
  const a = buildCodeMap(cv), b = buildCodeMap(cv);
  assert.deepEqual(a.regions.map((r) => [r.q, r.rr]), b.regions.map((r) => [r.q, r.rr]));
  const r = a.regions[3];
  assert.equal(regionAt(a, r.x + 2, r.y - 2).id, r.id);
});

test('a commit scope is read from the conventional subject', () => {
  assert.equal(scopeOf('feat(gitx-reader): read regions'), 'gitx-reader');
  assert.equal(scopeOf('chore: tidy'), '');
});
