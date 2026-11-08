import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywords, hitsOf, shownAndOn, dominant, regionHits } from './search.js';

test('keywords split by ";", each with its own colour', () => {
  const kw = keywords('Path Knowledge; Path');
  assert.deepEqual(kw.map((k) => k.key), ['path knowledge', 'path']);
  assert.notEqual(kw[0].col, kw[1].col);
});

test('a keyword of several words must appear side by side, with a space, a hyphen or joined', () => {
  const [k] = keywords('path knowledge');
  assert.deepEqual(hitsOf([k], 'the path knowledge of'), [1]);
  assert.deepEqual(hitsOf([k], 'Path-Knowledge'), [1]);
  assert.deepEqual(hitsOf([k], 'pathknowledge'), [1]);
  assert.deepEqual(hitsOf([k], 'path and knowledge'), [0], 'adding words never widens a keyword');
});

test('a word of four letters or more matches word starts; a shorter one only whole words', () => {
  assert.deepEqual(hitsOf(keywords('canvas'), 'CanvasX and canvases'), [2]);
  assert.deepEqual(hitsOf(keywords('map'), 'maps and a map'), [1]);
});

test('two keywords also search each pair side by side, both ways, shown only when found', () => {
  const kw = keywords('path; knowledge');
  assert.deepEqual(kw.map((k) => k.key), ['path', 'knowledge', 'path knowledge', 'knowledge path']);
  assert.deepEqual(kw.map((k) => k.auto), [false, false, true, true]);
  const on = shownAndOn(kw, [3, 5, 2, 0]);
  assert.deepEqual(on.map((o) => o.shown), [true, true, true, false]);
});

test('a hexagon takes the colour of the most specific keyword in it, then the busiest', () => {
  const kw = keywords('path; knowledge');
  const on = shownAndOn(kw, [1, 1, 1, 1]);
  assert.equal(dominant(kw, on, [9, 4, 1, 0]), 2, 'two words beat more hits');
  assert.equal(dominant(kw, on, [2, 7, 0, 0]), 1);
});

test('a code region weighs its code and plan box three times, commits and decisions once each, at most four', () => {
  const kw = keywords('canvas');
  const per = regionHits(kw, { code: 'canvas.py read_canvas', box: 'Reading the canvas', commits: Array(6).fill('read a canvas'), thoughts: ['canvas words'] });
  assert.deepEqual(per, [3 * 2 + 3 * 1 + 4 + 1]);
});
