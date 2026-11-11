import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskFormHtml, formBody, kdBarHtml, kdDesksHtml, kdMonitoringHtml, kdTrackingHtml, trackMark, trackedOn } from './kd.js';
import { model, boxesUnder } from './hexmain.js';

const ROWS = [
  { desk: 'portfolio', desk_name: 'Portfolio', hex: 'h:Proj/tm-1/14. Typed data', address: 'Plan (totem) > 14. Typed data', canvas: 'Proj', state: 'changed', read_at: '2026-11-12T09:00:00Z' },
  { desk: 'portfolio', desk_name: 'Portfolio', hex: 'h:Proj/tm-1/3. Map view', address: 'Plan (totem) > 3. Map view', canvas: 'Proj', state: 'same', read_at: '2026-11-12T09:00:00Z' },
];
const OV = { url: 'http://127.0.0.1:7796', up: true, note: '', tracking: ROWS,
  canvases: [{ canvas: 'Proj', boxes: 2, updated_at: '2026-11-12T08:00:00Z' }],
  desks: [{ slug: 'portfolio', version: 2, name: 'Portfolio', role: 'Builds the portfolio page', owner: 'portfolio', main_canvas: 'Portfolio',
    attached: ['Resume'], sitting: [{ sitting: 1, desk: 'portfolio', agent: 'Claude Code', client: 'claude-code 2.3', since: '2026-11-12T09:00:00Z', away: false }] }] };

test('the section bar marks the one open and counts changed tracked boxes', () => {
  const h = kdBarHtml('tracking', OV);
  assert.match(h, /data-kdsec="tracking" aria-pressed="true"/);
  assert.match(h, /Tracking<span class="badge">1<\/span>/);
  assert.match(kdBarHtml('desks', { up: false, note: 'Knowledge Desk is not running' }), /Knowledge Desk is not running/);
});

test('a desk card says its role, canvases, who sits there and what it tracks', () => {
  const h = kdDesksHtml(OV, null, ['Portfolio', 'Resume'], '');
  assert.match(h, /<h3>Portfolio<\/h3>/);
  assert.match(h, /Portfolio <span class="mt">written as portfolio/);
  assert.match(h, /<b>Claude Code<\/b> <span class="mt">\(claude-code 2\.3\)/);
  assert.match(h, /2 boxes · <b class="hot">1 changed since read/);
  assert.match(h, /data-kd="remove" data-slug="portfolio"/);
  assert.match(h, /Create a desk/);
});

test('nobody sitting says how to sit, and a down Knowledge Desk says why', () => {
  const h = kdDesksHtml({ ...OV, desks: [{ ...OV.desks[0], sitting: [] }] }, null, [], '');
  assert.match(h, /tell an agent: sit at the Portfolio desk/);
  assert.match(kdDesksHtml({ up: false, note: 'not running', desks: [], tracking: [] }, null, [], ''), /not running/);
});

test('the form offers only added canvases, and keeps a change to the desk it changes', () => {
  const h = deskFormHtml({ slug: 'portfolio', name: 'Portfolio', role: 'r', main_canvas: 'Resume', attached: ['Proj'] }, ['Resume', 'Proj']);
  assert.match(h, /Change Portfolio/);
  assert.match(h, /<option value="Resume" selected>/);
  assert.match(h, /value="Proj" checked/);
  const fd = new FormData();
  fd.set('name', ' Portfolio '); fd.set('role', 'Builds it'); fd.set('main_canvas', 'Resume'); fd.append('attached', 'Proj'); fd.set('owner', '');
  assert.deepEqual(formBody(fd, null), { name: 'Portfolio', role: 'Builds it', main_canvas: 'Resume', attached: ['Proj'] });
  assert.deepEqual(formBody(fd, 'portfolio').desk, 'portfolio');
});

test('tracking lists each desk\'s boxes, changed first, and the index', () => {
  const h = kdTrackingHtml(OV);
  assert.ok(h.indexOf('14. Typed data') < h.indexOf('3. Map view'), 'changed first');
  assert.match(h, /<li class="changed">/);
  assert.match(h, /Proj<\/span><span class="mt">2 boxes/);
  assert.match(kdTrackingHtml({ ...OV, tracking: [] }), /No desk tracks a box yet/);
});

test('monitoring says plainly it is not built yet', () => {
  assert.match(kdMonitoringHtml(), /neither is built yet/);
});

test('the Tracking layer finds each tracked box on the map and counts them above it', () => {
  const { reg } = model([{ name: 'Proj', agent: true, repos: [], totems: [{ name: 'Plan', items: [], boxes: [
    { name: '14. Typed data', items: [], boxes: [] }, { name: '3. Map view', items: [], boxes: [] }, { name: '5. Other', items: [], boxes: [] }], subs: [] }] },
  { name: 'Elsewhere', agent: false, repos: [], totems: [{ name: 'Plan', items: [], boxes: [{ name: '14. Typed data', items: [], boxes: [] }], subs: [] }] }]);
  const on = trackedOn(reg, ROWS);
  assert.equal(on.size, 2, 'the same name on another canvas is not tracked');
  const typed = [...on.keys()].find((id) => reg[id].name === '14. Typed data');
  assert.equal(reg[reg[typed].canvas].name, 'Proj');
  const m = trackMark(typed, [], on);
  assert.deepEqual([m.own, m.moved, m.label], [true, true, 'tracked by Portfolio · changed']);
  const proj = reg.root.children.find((id) => reg[id].name === 'Proj');
  assert.equal(trackMark(proj, boxesUnder(reg, proj), on).label, '2 tracked · changed');
  const other = Object.keys(reg).find((id) => reg[id].name === '5. Other');
  assert.equal(trackMark(other, [], on), null);
});
