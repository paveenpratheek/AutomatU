import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeRegions } from '../src/align.js';

const sections = new Map([['A', [1, 0, 0]], ['B', [0, 1, 0]], ['C', [0.7071, 0.7071, 0]]]);

test('a clear match is placed under its section', () => {
  const [p] = placeRegions(new Map([['r', [1, 0, 0]]]), sections, { minScore: 0.5, minMargin: 0.1 });
  assert.equal(p.section, 'A');
  assert.equal(p.best, 'A');
});

test('a match too close to the runner-up waits, with its nearest section kept', () => {
  /* C at about 0.95, B at about 0.89: strong, but only 0.06 apart. */
  const [p] = placeRegions(new Map([['r', [0.45, 0.89, 0]]]), sections, { minScore: 0.5, minMargin: 0.1 });
  assert.equal(p.section, null);
  assert.equal(p.best, 'C');
  assert.ok(p.margin < 0.1);
});

test('a weak match waits however far ahead it is', () => {
  const [p] = placeRegions(new Map([['r', [0.3, 0, 0.95]]]), sections, { minScore: 0.5, minMargin: 0 });
  assert.equal(p.section, null);
});

test('placing without calibrated numbers is refused', () => {
  assert.throws(() => placeRegions(new Map(), sections, {}), /calibration/);
});
