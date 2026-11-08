import { test } from 'node:test';
import assert from 'node:assert/strict';
import { model, pathTo, boxesUnder, canvasLayout, rootLayout, spiral, hd } from './hexmain.js';

const CANVASES = [
  { name: 'Plan', agent: true, repos: [{ repo: 'E:/x/AutomatU', name: 'AutomatU', totem: 'Build' }], totems: [
    { name: 'Build', owner: 'agent', text: 'about', items: [], links: [['1. Read', '2. Show']], subs: [
      { name: 'Later', text: '', items: [], boxes: [{ name: 'Agents', items: [{ type: 'note', label: 'Note', name: 'Todo', text: '- [ ] maps' }], boxes: [] }] },
    ], boxes: [
      { name: '1. Read', items: [{ type: 'note', label: 'Note', name: 'Files', text: 'read' }], boxes: [{ name: 'Inner', items: [], boxes: [] }] },
      { name: '2. Show', items: [], boxes: [] },
    ] },
  ] },
  { name: 'Other', agent: false, repos: [], totems: [] },
];

test('the canvases become one registry: canvas > totem > sub-totem > boxes', () => {
  const m = model(CANVASES);
  const plan = m.reg.root.children.map((id) => m.reg[id]).find((x) => x.name === 'Plan');
  const totem = m.reg[plan.children[0]];
  assert.equal(totem.kind, 'totem');
  assert.deepEqual(totem.plans, ['AutomatU']);
  assert.deepEqual(totem.children.map((id) => m.reg[id].name), ['1. Read', '2. Show']);
  assert.equal(m.reg[totem.subs[0]].kind, 'sub');
  const inner = Object.values(m.reg).find((x) => x.name === 'Inner');
  assert.deepEqual(pathTo(m.reg, inner.id).map((id) => m.reg[id].name), ['Map', 'Plan', 'Build', '1. Read', 'Inner']);
  assert.equal(boxesUnder(m.reg, totem.id).length, 5);
  assert.equal(m.items.length, 2);
});

test('a link on the canvas joins the boxes it names', () => {
  const m = model(CANVASES);
  assert.equal(m.blinks.length, 1);
  assert.deepEqual([m.reg[m.blinks[0].a].name, m.reg[m.blinks[0].b].name], ['1. Read', '2. Show']);
});

test('canvases sit side by side one hexagon apart; a totem in the middle of its sub-totems', () => {
  const m = model(CANVASES);
  const root = rootLayout(m), [a, b] = Object.values(root);
  assert.equal(hd(a, b), 2);
  const plan = m.reg.root.children[0], L = canvasLayout(m, plan), totem = m.reg[plan].children[0];
  assert.deepEqual(L[totem], [0, 0]);
  assert.equal(hd(L[totem], L[m.reg[totem].subs[0]]), 1);
});

test('boxes inside a box go round in a spiral, nearest first', () => {
  const s = spiral(7);
  assert.deepEqual(s[0], [0, 0]);
  assert.ok(s.slice(1).every((c) => hd(c, [0, 0]) === 1));
});
