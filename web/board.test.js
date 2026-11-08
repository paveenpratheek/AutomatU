import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardHtml, polyWire } from './board.js';
import { model } from './hexmain.js';

const m = model([{ name: 'Plan', agent: true, repos: [{ repo: 'E:/x/A', name: 'A', totem: 'Build' }], totems: [
  { name: 'Build', owner: 'agent', text: 'About the plan', items: [], links: [], subs: [{ name: 'Later', text: '', items: [], boxes: [{ name: 'Agents', items: [], boxes: [] }] }],
    boxes: [{ name: '1. Read', items: [{ type: 'note', label: 'Note', name: 'Files', text: 'read the files' }], boxes: [{ name: 'Inner', items: [], boxes: [] }] }] },
] }]);
const pal = () => ({ ring: '#000', soft: '#fff', ink: '#111', swatch: '#222', fill: '#eee' });

test('a totem is a frame with its boxes, its notes and its sub-totems', () => {
  const cid = m.reg.root.children[0];
  const { html, totems } = boardHtml(m, cid, pal, () => false, '');
  assert.deepEqual(totems.map((t) => t.name), ['Build']);
  for (const s of ['Build', 'About the plan', '1. Read', 'Files', 'read the files', 'Inner', 'Later', 'Sub-totem', 'the plan of A']) assert.ok(html.includes(s), s);
  assert.equal((html.match(/data-bid=/g) || []).length, 3, 'every box, inside boxes too, can be a wire end');
});

test('a box holding a keyword is ringed and says so', () => {
  const cid = m.reg.root.children[0];
  const { html } = boardHtml(m, cid, pal, (it) => it.text.includes('files'), 'files');
  assert.ok(html.includes('files · 1'));
});

test('an image on the canvas is shown at its own proportions and opens large', () => {
  const mi = model([{ name: 'Plan', agent: true, repos: [], totems: [
    { name: 'Build', owner: 'agent', text: '', items: [], links: [], subs: [],
      boxes: [{ name: 'Shapes', items: [{ type: 'file', label: 'Image', name: 'flow', text: '', image: true, id: 'f1', src: '/api/canvas-image?canvas=Plan&id=f1', ratio: '480 / 720' }], boxes: [] }] },
  ] }]);
  const { html } = boardHtml(mi, mi.reg.root.children[0], pal, () => false, '');
  assert.ok(html.includes('<img class="bimg" src="/api/canvas-image?canvas=Plan&amp;id=f1"'));
  assert.ok(html.includes('aspect-ratio:480 / 720'));
  assert.ok(html.includes('data-pic='));
});

test('a wire leaves from a dot and arrives with an arrow, its corners rounded', () => {
  const w = polyWire([[0, 0], [100, 0], [100, 80]], '#B0447A');
  assert.ok(w.d.startsWith('M ') && w.d.includes(' Q '));
  assert.equal(w.arrow.split(' ').length, 3);
  assert.equal(w.color, '#B0447A');
});
