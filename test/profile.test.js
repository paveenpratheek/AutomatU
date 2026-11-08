import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveThoughts, mix } from '../src/profile.js';
import { cosine } from '../src/embed.js';

test('rejected, stashed and superseded thoughts are not what the code does', () => {
  const t = (id, outcome, links = []) => ({ id, outcome, links, text: id });
  const live = liveThoughts({
    a: t('a', 'accepted'),
    b: t('b', 'rejected'),
    c: t('c', 'stashed'),
    d: t('d', 'accepted'),
    e: t('e', 'accepted', [{ type: 'supersedes', to: 'd' }]),
    f: t('f', 'open'),
  });
  assert.deepEqual(Object.keys(live).sort(), ['a', 'e', 'f']);
});

test('a mix leans toward the heavier part and comes out unit length', () => {
  const v = mix([{ v: [1, 0], w: 0.75 }, { v: [0, 1], w: 0.25 }]);
  assert.ok(v[0] > v[1]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
});

test('nothing with weight gives no vector', () => {
  assert.equal(mix([{ v: null, w: 1 }, { v: [1, 0], w: 0 }]), null);
});

test('cosine of a vector with itself is one', () => {
  assert.ok(Math.abs(cosine([0.3, 0.4], [0.3, 0.4]) - 1) < 1e-12);
});
