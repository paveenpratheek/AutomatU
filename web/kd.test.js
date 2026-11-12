import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFlowStep, deskFormHtml, formBody, kdBarHtml, kdDesksHtml, kdTrackingHtml, kfHtml, monitoringHtml, moveFlowStep,
  removeFlowStep, runsHtml, setFlowField, starterFlow, trackMark, trackedOn } from './kd.js';
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

test('monitoring shows each agent at its desk, its calls with failures, and A2A with who sent each', () => {
  const mon = { up: true, note: 'estimate', sessions: [{ desk: 'portfolio', source: 'claude-code', session: 's1', first: '2026-11-12T10:00:00Z',
    last: '2026-11-12T10:05:00Z', model_calls: 3, input_tokens: 12000, output_tokens: 900, cache_read: 50000, cache_write: 0, cost_usd: 0.071,
    tool_calls: 4, errors: 1 }, { desk: 'portfolio', source: 'antigravity', session: 'c1', model_calls: 2, input_tokens: 100, output_tokens: 10,
    cache_read: 0, cost_usd: null, tool_calls: 1, errors: 0 }],
    calls: [{ desk: 'portfolio', source: 'claude-code', kind: 'tool', name: 'Bash', ok: false, error: 'tests failed', duration_ms: 4000, at: '2026-11-12T10:00:09Z' }],
    tasks: [{ desk: 'resume-maker', caller: 'main-agent', job: 'analyse-for-job', state: 'completed', started_at: '2026-11-12T09:00:00' }] };
  const h = monitoringHtml(mon);
  assert.match(h, /Claude Code · s1/);
  assert.match(h, /3 model calls · 12\.0k in, 900 out, 50\.0k cache read · about \$0\.07 · 4 tool calls · <b class="hot">1 failed/);
  assert.match(h, /no cost \(no model named\)/);
  assert.match(h, /<li class="bad"><span class="nm">Bash<\/span>.*tests failed/);
  assert.match(h, /main-agent → resume-maker: analyse-for-job/);
  assert.match(monitoringHtml({ up: false, note: 'Knowledge Desk is not running' }), /not running/);
});

test('a flow is edited step by step: added, moved, removed, filled in', () => {
  let st = starterFlow();
  assert.deepEqual(st.map((x) => x.step), ['read_main', 'gather', 'agent', 'check_citations', 'stop', 'agent', 'check_write']);
  st = addFlowStep(st, 'stop');
  assert.equal(st.length, 8);
  assert.deepEqual(moveFlowStep(st, 0, -1), st, 'nothing above the first');
  assert.equal(moveFlowStep(st, 1, 1)[2].step, 'gather');
  assert.equal(removeFlowStep(st, 7).length, 7);
  assert.equal(setFlowField(st, 3, 'tries', '9')[3].tries, 5, 'tries stay within 1 to 5');
  assert.equal(setFlowField(st, 2, 'instruction', 'Write it')[2].instruction, 'Write it');
});

test('the flow editor shows the steps with who does each, the rules, and a stop waiting on you with Yes and No', () => {
  const cat = { read_main: { actor: 'code', name: 'Read the Main canvas', does: 'reads' }, agent: { actor: 'agent', name: 'Agent step', does: '' },
    check_citations: { actor: 'code', name: 'Check citations', does: '' }, stop: { actor: 'user', name: 'Your stop', does: '' } };
  const runs = [{ id: 'r-1', flow: 'Build page', version: 2, task: 'portfolio', state: 'waiting_user', step: 4, waiting: { question: 'Write this?' } },
    { id: 'r-0', flow: 'Build page', version: 1, task: 'old', state: 'given_up', step: 3, said: 'gave up after 3 tries' }];
  const kf = { desks: [{ slug: 'portfolio', name: 'Portfolio' }], desk: 'portfolio', name: 'Build page',
    steps: [{ step: 'read_main' }, { step: 'agent', mode: 'draft', instruction: 'Write it' }, { step: 'check_citations', tries: 3 }, { step: 'stop', question: 'Write this?' }],
    data: { steps: cat, rules: ['A flow starts by reading the Main canvas.'], flows: [{ name: 'Build page', version: 2 }], runs }, problems: ['step 2: x'] };
  const h = kfHtml(kf);
  assert.match(h, /<b>Agent step<\/b><span class="mt">the agent at the desk/);
  assert.match(h, /<b>Your stop<\/b><span class="mt">you/);
  assert.match(h, /data-kf-field="instruction" data-i="1"[^>]*>Write it</);
  assert.match(h, /Build page<span class="wf-ver">v2/);
  assert.match(h, /A flow starts by reading the Main canvas/);
  assert.match(h, /<li>step 2: x<\/li>/);
  assert.match(runsHtml(runs), /waiting on your yes · step 5.*Write this\?.*data-kf="yes" data-run="r-1"/s);
  assert.match(runsHtml(runs), /gave up · step 4 · gave up after 3 tries/);
  assert.match(kfHtml({ desks: [] }), /Create a desk under Desks first/);
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
