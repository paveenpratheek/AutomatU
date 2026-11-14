import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFlowStep, askHtml, askText, citations, deskFormHtml, flowReadHtml, formBody, hexParts, kdBarHtml, kdDesksHtml, kdTrackingHtml, kfHtml, mergeOverview, monitoringHtml, moveFlowStep,
  removeFlowStep, runsHtml, setFlowField, starterFlow, toneOf, trackMark, trackedOn } from './kd.js';
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
  assert.ok(h.indexOf('data-kdsec="ask"') < h.indexOf('data-kdsec="desks"'), 'Ask comes first');
  assert.match(h, /data-kdsec="monitoring"/);
});

test('a desk card says its role, canvases, who sits there and what it tracks', () => {
  const h = kdDesksHtml(OV, null, ['Portfolio', 'Resume'], '');
  assert.match(h, /<h3>Portfolio<\/h3>/);
  assert.match(h, /Main canvas<\/span><span class="v">Portfolio</);
  assert.match(h, /v2 · owner portfolio/);
  assert.match(h, /data-kd="flow" data-slug="portfolio">Its flow/);
  assert.match(h, /<span class="kdchip"><svg[^>]*>.*?<\/svg>Resume<\/span>/);
  assert.match(h, /<b>Claude Code<\/b> <span class="mt">\(claude-code 2\.3\)/);
  assert.match(h, /2 boxes, <b class="hot">1 changed/);
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
  assert.match(h, /<div class="kdli changed">/);
  assert.match(h, /Proj<\/span><span class="k">2 boxes · 12 Nov/);
  assert.match(h, /<b>2<\/b><span>boxes tracked<\/span>.*<b>1<\/b><span>changed since last read<\/span>.*<b>12 Nov<\/b>/s);
  assert.match(h, /Changed since Portfolio last read them/);
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
    data: { steps: cat, rules: ['A flow starts by reading the Main canvas.'], flows: [{ name: 'Build page', version: 2 }], runs }, problems: ['step 2: x'], editing: true };
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

test('a flow reads step by step - who does each, its words, and the rules - with its editor one click away', () => {
  const cat = { read_main: { actor: 'code', name: 'Read the Main canvas', does: 'Reads the Main canvas' }, gather: { actor: 'code', name: 'Gather', does: '' },
    agent: { actor: 'agent', name: 'Agent step', does: '' }, stop: { actor: 'user', name: 'Your stop', does: '' } };
  const f = { name: 'PortFolio', version: 1, steps: [{ step: 'read_main' }, { step: 'gather', built_only: true }, { step: 'agent', mode: 'draft', instruction: 'Write <it>' }, { step: 'stop', question: 'Add these?' }] };
  const h = flowReadHtml(f, cat, 'Portfolio', [{ flow: 'PortFolio', version: 1, state: 'done' }]);
  assert.match(h, /Portfolio desk · version 1 · 4 steps/);
  assert.match(h, /<b>Read the Main canvas<\/b><span class="kfa a-code">Knowledge Desk<\/span>/);
  assert.match(h, /<b>Gather<\/b><span class="kfa a-code">Knowledge Desk<\/span><span class="mt">built work only/);
  assert.match(h, /<span class="kfa a-agent">agent<\/span><span class="mt">draft<\/span><\/div><q class="kfq">Write &lt;it&gt;<\/q>/);
  assert.match(h, /<span class="kfa a-user">you<\/span><\/div><q class="kfq">Add these\?/);
  assert.equal((h.match(/class="kfr ran"/g) || []).length, 4, 'a finished run of this version fills every step');
  assert.doesNotMatch(flowReadHtml(f, cat, 'Portfolio', []), /kfr ran/);
  const kf = { desks: [{ slug: 'portfolio', name: 'Portfolio' }], desk: 'portfolio', name: 'PortFolio', steps: f.steps,
    data: { steps: cat, rules: ['A flow starts by reading the Main canvas.'], flows: [f], runs: [] } };
  const r = kfHtml(kf);
  assert.match(r, /data-kf="edit">Edit steps/);
  assert.doesNotMatch(r, /data-kf-field/, 'read, not edited, until Edit steps');
  assert.match(r, /Every flow keeps these rules.*A flow starts by reading/s);
  assert.match(kfHtml({ ...kf, editing: true }), /data-kf="done">Done editing/);
});

const ANSWER = { question: 'What did I build with Pydantic?', only: 'built',
  sentences: [{ text: 'Pydantic models for what AutomatU keeps', hex: 'h:AutomatU/tm-a39e299aa1/14. Typed data', status: 'built' },
    { text: 'A new repository, in Python 3.12', hex: 'h:Work Desks/tm-5cea2b609f/0. The repository', status: 'built' },
    { text: 'Typed notices <checked>', hex: 'h:AutomatU/tm-a39e299aa1/14. Typed data', status: 'built' }],
  passages: [{ hex: 'h:AutomatU/tm-a39e299aa1/14. Typed data', address: 'AutomatU Build Plan (totem) > 14. Typed data' },
    { hex: 'h:Work Desks/tm-5cea2b609f/0. The repository', address: 'Work Desks Build Plan (totem) > 0. The repository' },
    { hex: 'h:PortFolio/tm-9/Skills from the projects', address: 'Skills (totem) > Skills from the projects' }] };

test('a hex names its canvas and box, and an answer numbers the boxes it cites in the order first cited', () => {
  assert.deepEqual(hexParts('h:Work Desks/tm-5cea2b609f/0. The repository'), { canvas: 'Work Desks', id: 'tm-5cea2b609f', box: '0. The repository' });
  const C = citations(ANSWER);
  assert.deepEqual(C.sources.map((s) => [s.n, s.canvas, s.under, s.box]),
    [[1, 'AutomatU', 'AutomatU Build Plan', '14. Typed data'], [2, 'Work Desks', 'Work Desks Build Plan', '0. The repository']]);
  assert.deepEqual(C.read.map((r) => r.box), ['Skills from the projects'], 'a passage no sentence cites is only read');
  assert.equal(askText({ a: ANSWER }).split('\n')[2], '"Typed notices <checked>" [1]');
  assert.deepEqual(toneOf('Harness', ['AutomatU', 'Harness']), { fill: '#F4C6B8', deep: '#C6613F' });
  assert.deepEqual(toneOf('Unknown', []), toneOf('Unknown', []), 'a canvas not added still keeps one colour');
});

test('Ask shows the question, each quoted sentence with its numbered hex, the sources, and what to do next', () => {
  const h = askHtml({ q: ANSWER.question, only: true, a: ANSWER, cite: 1 }, ['AutomatU', 'Work Desks']);
  assert.match(h, /<div class="askq">What did I build with Pydantic\?<\/div>/);
  assert.match(h, /<span class="asktag">Built work only<\/span>/);
  assert.match(h, /class="askline on" data-ask-cite="1"><span class="tx">“Pydantic models for what AutomatU keeps”/);
  assert.match(h, /“Typed notices &lt;checked&gt;”/);
  assert.match(h, /3 sentences · 2 boxes · 2 canvases/);
  assert.match(h, /class="asksrc on" data-ask-cite="1">.*?<b>14\. Typed data<\/b><span class="mt">AutomatU › AutomatU Build Plan<\/span><span class="hexid">tm-a39e299aa1/s);
  assert.match(h, /Also read.*Skills from the projects/s);
  assert.match(h, /data-ask="plans">Include plans/);
  assert.match(askHtml({}, []), /What do you want to know\?/);
  assert.match(askHtml({ q: 'x', busy: true }, []), /Reading the canvases/);
  assert.match(askHtml({ q: 'x', err: 'Knowledge Desk is not running' }, []), /<p class="said">Knowledge Desk is not running/);
  assert.match(askHtml({ q: 'x', only: true, a: { only: 'built', sentences: [], passages: [] } }, []), /Nothing on your canvases answers that among built work/);
});

test('a slow Knowledge Desk keeps the page as last read and says so; only one that is down empties it', () => {
  const slow = { up: false, slow: true, note: 'Knowledge Desk did not answer in time', desks: [], tracking: [] };
  const kept = mergeOverview(OV, slow);
  assert.equal(kept.desks[0].name, 'Portfolio', 'the desks stay');
  assert.equal(kept.late, 'Knowledge Desk did not answer in time');
  assert.match(kdDesksHtml(kept, null, [], ''), /did not answer in time - showing the desks as last read/);
  const down = { up: false, slow: false, note: 'Knowledge Desk is not running', desks: [], tracking: [] };
  assert.equal(mergeOverview(OV, down), down, 'a refused connection replaces it');
  assert.equal(mergeOverview(null, slow), slow, 'nothing read before: nothing to keep');
  const late = { ...OV, tracking: [], tracking_late: true };
  const merged = mergeOverview(OV, late);
  assert.equal(merged.tracking.length, 2, 'the tracked boxes as last read');
  assert.match(kdTrackingHtml(merged), /Tracking did not answer in time - showing the tracked boxes as last read/);
  assert.equal(mergeOverview(OV, OV), OV, 'a full answer is taken as it is');
});
