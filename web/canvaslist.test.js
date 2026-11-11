import { test } from 'node:test';
import assert from 'node:assert/strict';
import { action, canvasListHtml, ordered } from './canvaslist.js';

const LIST = { canvases: [
  { name: 'Portfolio', added: false, rules: false, agent: true, repos: [], missing: false },
  { name: 'AutomatU', added: true, rules: false, agent: true, repos: ['E:/Coding CLI/Project AutomatU'], missing: false },
  { name: 'Ruling Test', added: false, rules: true, agent: false, repos: [], missing: false },
  { name: 'Resume', added: true, rules: false, agent: true, repos: [], missing: false },
  { name: 'Old', added: true, rules: false, agent: false, repos: [], missing: true },
] };

test('the canvases in AutomatU come first, the rest after, each in NoteX order', () => {
  assert.deepEqual(ordered(LIST.canvases).map((c) => c.name), ['AutomatU', 'Resume', 'Old', 'Portfolio', 'Ruling Test']);
});

test('a canvas offers add or remove; the rules canvas and a bound canvas offer nothing, saying why', () => {
  const by = Object.fromEntries(LIST.canvases.map((c) => [c.name, action(c)]));
  assert.equal(by.Portfolio.kind, 'add');
  assert.equal(by.Resume.kind, 'remove');
  assert.equal(by['Ruling Test'].kind, 'none');
  assert.match(by['Ruling Test'].why, /rules canvas/);
  assert.equal(by.AutomatU.kind, 'none');
  assert.match(by.AutomatU.why, /plans Project AutomatU/);
});

test('the sheet counts what is in AutomatU and marks a canvas NoteX no longer has', () => {
  const h = canvasListHtml(LIST);
  assert.match(h, /Canvases in AutomatU · 3/);
  assert.match(h, /data-canvas-add="Portfolio"/);
  assert.match(h, /data-canvas-remove="Resume"/);
  assert.doesNotMatch(h, /data-canvas-(add|remove)="(Ruling Test|AutomatU)"/);
  assert.match(h, /NoteX no longer has it/);
});

test('while one change is sent every button waits, and the one sent says so', () => {
  const h = canvasListHtml(LIST, { busy: 'Portfolio' });
  assert.match(h, /data-canvas-add="Portfolio" disabled>Adding…/);
  assert.match(h, /data-canvas-remove="Resume" disabled>Remove/);
});

test('names are escaped, and a failure is said', () => {
  assert.match(canvasListHtml({ canvases: [{ name: '<b>x', added: false, repos: [] }] }), /&lt;b&gt;x/);
  assert.match(canvasListHtml(null, { failed: 'NoteX is not running' }), /Could not read NoteX's canvases: NoteX is not running/);
});
