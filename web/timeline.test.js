import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleOf, phaseAt, ist, lastMapIn } from './timeline.js';

const phases = [
  { start: '2026-11-08T11:59:56.147Z', end: '2026-11-08T12:58:27.000Z' },
  { start: '2026-11-08T12:58:27.000Z', end: '2026-11-08T15:06:12.292Z' },
  { start: '2026-11-08T15:06:12.292Z', end: null },
];

test('a moment sits along the strip from the first phase to now, and falls in one phase', () => {
  const at = scaleOf(phases, '2026-11-09T11:59:56.147Z');
  assert.equal(at(phases[0].start), 0);
  assert.equal(at('2026-11-09T11:59:56.147Z'), 1);
  assert.equal(phaseAt(phases, '2026-11-08T13:00:00Z'), 1);
  assert.equal(phaseAt(phases, '2026-11-09T09:00:00Z'), 2);
  assert.equal(phaseAt(phases, '2026-11-08T10:00:00Z'), -1);
});

test('times are read in IST', () => {
  assert.equal(ist('2026-11-08T11:59:56.147Z'), '8 Nov, 17:29 IST');
  assert.equal(ist('2026-11-08T18:45:00Z', false), '00:15 IST');
});

test('a phase is shown by the newest map made inside it', () => {
  const maps = [{ id: 1, at: '2026-11-08T12:49:55Z' }, { id: 2, at: '2026-11-08T12:58:27Z' }, { id: 4, at: '2026-11-08T14:41:44Z' }];
  assert.equal(lastMapIn(maps, phases[1].start, phases[1].end).id, 4);
  assert.equal(lastMapIn(maps, phases[0].start, phases[0].end).id, 1);
});

test('the scrubber rests on the nearest map, plan version or now, and a moment shows the newest map before it', async () => {
  const { snapTargets, nearestTarget, timeAt, mapAtOrBefore } = await import('./timeline.js');
  const T = { now: '2026-11-09T11:59:56.147Z', phases: [{ start: '2026-11-08T11:59:56.147Z', end: null, versions: ['2026-11-08T13:55:22.578Z'] }],
    maps: [{ id: 1, at: '2026-11-08T12:49:55Z' }, { id: 4, at: '2026-11-08T14:41:44Z' }] };
  const targets = snapTargets(T);
  assert.deepEqual(targets.map((t) => t.kind), ['map', 'version', 'map', 'now']);
  const at = scaleOf(T.phases, T.now);
  assert.equal(nearestTarget(targets, at, at('2026-11-08T13:50:00Z')).kind, 'version');
  assert.equal(nearestTarget(targets, at, 0.99).kind, 'now');
  assert.equal(Date.parse(timeAt(T.phases, T.now, 0.5)), (Date.parse(T.phases[0].start) + Date.parse(T.now)) / 2);
  assert.equal(mapAtOrBefore(T.maps, '2026-11-08T13:55:22.578Z').id, 1);
  assert.equal(mapAtOrBefore(T.maps, '2026-11-08T10:00:00Z'), null);
});

test('between two maps a region pops in, pops out, slides or changes colour', async () => {
  const { hexChanges, popDelay } = await import('./timeline.js');
  const prev = new Map([['a', { x: 0, y: 0, col: 'red' }], ['b', { x: 10, y: 0, col: 'red' }], ['c', { x: 20, y: 0, col: 'red' }], ['d', { x: 30, y: 0, col: 'red' }]]);
  const next = new Map([['a', { x: 0, y: 0, col: 'red' }], ['b', { x: 14, y: 3, col: 'red' }], ['c', { x: 20, y: 0, col: 'blue' }], ['e', { x: 40, y: 0, col: 'red' }]]);
  assert.deepEqual(hexChanges(prev, next), { enter: ['e'], leave: ['d'], move: ['b'], recolour: ['c'], stay: ['a'] });
  assert.equal(popDelay('r1', 100), popDelay('r1', 100));
  assert.ok(popDelay('r1', 100) >= 0 && popDelay('r1', 100) < 100);
});
