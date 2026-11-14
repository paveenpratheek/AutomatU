import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentsBoxHtml, agentsHtml, dayOf } from './agents.js';

const NOW = new Date('2026-11-14T12:00:00');
const DESK = { slug: 'portfolio', name: 'Portfolio', role: 'Builds my site', main_canvas: 'PortFolio', attached: [], owner: 'portfolio' };
const MODELS = { agy: [{ id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' }, { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' }],
  claude: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] };

test('the Agents button sits near the hex top left, with a dot while an agent is at the desk', () => {
  const h = agentsBoxHtml({ l: 100, t: 50, w: 200, h: 173 }, 'PortFolio', [], 'Portfolio');
  assert.match(h, /data-talk="PortFolio"/);
  assert.match(h, /left:154\.0px;top:55\.0px/);
  assert.match(h, /<span>Agents<\/span>/);
  assert.match(h, /choose an agent for the Portfolio desk/);
  assert.doesNotMatch(h, /agbox on/);
  assert.match(agentsBoxHtml({ l: 0, t: 0, w: 200, h: 173 }, 'PortFolio', [], 'Portfolio', true), /class="agbox on".*the agent at the Portfolio desk - open its chat/s);
  assert.match(agentsBoxHtml({ l: 0, t: 0, w: 200, h: 173 }, 'PortFolio', [{ agent: 'Claude Code' }], 'Portfolio'), /agbox on.*Claude Code is sitting/s);
  assert.match(agentsBoxHtml({ l: 0, t: 0, w: 200, h: 173 }, 'AutomatU'), /no desk&#39;s Main canvas yet/);
});

test('with no agent at the desk the window offers agy or Claude, the model and the folder', () => {
  const h = agentsHtml({ canvas: 'PortFolio', agent: 'agy', data: { canvas: 'PortFolio', desk: DESK, agent: null, messages: [], models: MODELS, folder: 'E:\Portfolio' } }, NOW);
  assert.match(h, /No agent is at the Portfolio desk yet/);
  assert.match(h, /value="agy" data-agent-pick="agy" checked>Antigravity/);
  assert.match(h, /<option value="gemini-3\.8-flash-high" selected>Gemini 3\.8 Flash \(High\)<\/option>/);
  assert.match(h, /id="tkfolder" name="folder" type="text" value="E:\Portfolio"/);
  assert.match(h, /Place the agent/);
  const c = agentsHtml({ canvas: 'PortFolio', agent: 'claude', data: { canvas: 'PortFolio', desk: DESK, agent: null, messages: [], models: MODELS } }, NOW);
  assert.match(c, /<option value="claude-opus-5-5" selected>/);
  assert.match(agentsHtml({ canvas: 'X', data: { canvas: 'X', note: 'This canvas is no desk\'s Main canvas.' } }), /no desk&#39;s Main canvas/);
});

test('the chat names who sent each message, shows the queue, the work in hand and the asks to answer', () => {
  const agent = { agent: 'agy', model: 'gemini-3.8-flash-low', folder: 'E:\Portfolio', state: 'waiting', working_on: 2,
    steps: [{ title: 'Read package.json', status: 'done' }], said: 'Starting the site' };
  const messages = [
    { id: 1, at: '2026-11-14T11:58:00', who: 'user', by: 'You', kind: 'message', text: 'Earlier <work>', state: 'done' },
    { id: 9, at: '2026-11-14T11:58:30', who: 'agent', by: 'The agent', kind: 'reply', text: 'Done it.', state: '', data: { steps: [{ title: 'Edit index.html', status: 'done' }] } },
    { id: 2, at: '2026-11-14T11:59:00', who: 'desk-agent-notes', by: 'The agent at the Notes desk', kind: 'message', text: 'Start the site on 8080', state: 'running' },
    { id: 3, at: '2026-11-14T11:59:10', who: 'agent', by: 'The agent', kind: 'ask', text: 'Run npm run dev', state: 'waiting', data: { paths: [] } },
    { id: 4, at: '2026-11-14T11:59:20', who: 'user', by: 'You', kind: 'message', text: 'Then check it', state: 'queued' },
  ];
  const h = agentsHtml({ canvas: 'PortFolio', data: { canvas: 'PortFolio', desk: DESK, agent, messages, models: MODELS } }, NOW);
  assert.match(h, /Antigravity at the Portfolio desk/);
  assert.match(h, /Gemini 3\.8 Flash \(Low\) · waiting on your answer/);
  assert.match(h, /tk-m me"><div class="tk-q">Earlier &lt;work&gt;<\/div>/);
  assert.match(h, /tk-m other"><div class="tk-by"><b>The agent at the Notes desk<\/b>.*Start the site on 8080/s);
  assert.match(h, /<summary>1 step<\/summary>/);
  assert.match(h, /tk-chip live">waiting on your answer/);
  assert.match(h, /Read package\.json.*Starting the site/s, 'the work in hand, as it goes');
  assert.match(h, /The agent asks to: <b>Run npm run dev<\/b>.*data-agent-answer="3" data-allow="1">Allow.*data-agent-answer="3" data-allow="0">Refuse/s);
  assert.match(h, /tk-chip">queued<\/span><button type="button" class="tk-link" data-agent-takeback="4">Take back/);
  assert.match(h, /data-agent-stop="1"/);
  assert.match(h, /data-agent-detach="1"/);
  assert.match(h, /Queued until the agent is free/);
  const i = h.indexOf('class="tk-body"'), f = h.indexOf('class="tk-foot col"');
  assert.ok(i > 0 && f > i && h.lastIndexOf('textarea') > f, 'the field stays below what scrolls');
});

test('a day is today or a date', () => {
  assert.equal(dayOf('2026-11-14T09:48:00', NOW), 'today');
  assert.equal(dayOf('2026-11-13 10:00:00+00:00', NOW), '13 Nov');
});

test('on a wide screen the window is landscape: the chat beside a panel of the work in hand, the queue and the agent', () => {
  const agent = { agent: 'agy', model: 'gemini-3.8-flash-low', folder: 'E:\Portfolio', state: 'working', working_on: 2, chosen_at: '2026-11-14T11:00:00',
    steps: [{ title: 'Read package.json', status: 'done' }, { title: 'python -m http.server 8080', status: 'working' }], said: 'Starting' };
  const messages = [
    { id: 2, at: '2026-11-14T11:59:00', who: 'desk-agent-notes', by: 'The agent at the Notes desk', kind: 'message', text: 'Host the site on 8080', state: 'running' },
    { id: 3, at: '2026-11-14T11:59:10', who: 'agent', by: 'The agent', kind: 'ask', text: 'Run npm run dev', state: 'waiting', data: {} },
    { id: 4, at: '2026-11-14T11:59:20', who: 'user', by: 'You', kind: 'message', text: 'Then check it', state: 'queued' },
  ];
  const h = agentsHtml({ canvas: 'PortFolio', wide: true, data: { canvas: 'PortFolio', desk: DESK, agent, messages, models: MODELS } }, NOW);
  assert.match(h, /class="tk wide"/);
  const main = h.indexOf('class="tk-main"'), side = h.indexOf('class="tk-side"');
  assert.ok(main > 0 && side > main, 'the chat first, the panel beside it');
  const chat = h.slice(main, side), panel = h.slice(side);
  assert.match(chat, /data-agent-answer="3" data-allow="1">Allow/, 'asks are still answered in the chat');
  assert.match(chat, /textarea id="tktext"/);
  assert.doesNotMatch(chat, /data-agent-takeback|Read package\.json/, 'the queue and the live steps are in the panel, not twice');
  assert.match(panel, /Now<\/div><div class="tk-now"><span class="tk-chip live">working…<\/span><div class="tk-nowq" title="Host the site on 8080">/);
  assert.match(panel, /from The agent at the Notes desk/);
  assert.match(panel, /2 steps<\/div><ul class="tk-steps"><li class="done"[^>]*><span>Read package\.json/);
  assert.match(panel, /1 ask waiting on you/);
  assert.match(panel, /Queue · 1<\/div><div class="tk-qi"><span class="tt" title="Then check it">.*data-agent-takeback="4">Take back/s);
  assert.match(panel, /<code title="E:\Portfolio">E:\Portfolio<\/code>/);
  assert.match(panel, /data-agent-stop="1">Stop what it is doing/);
  const choose = agentsHtml({ canvas: 'PortFolio', wide: true, data: { canvas: 'PortFolio', desk: DESK, agent: null, messages: [], models: MODELS } }, NOW);
  assert.match(choose, /class="tk wide".*Place the agent.*class="tk-side".*Nothing has been said at this desk yet/s, 'the choice beside what was said before');
});

test('the closed pop-up is gone from the page, not an empty box over the map', async () => {
  const css = (await import('node:fs')).readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, /\.talk\[hidden\]\s*\{\s*display:\s*none;?\s*\}/, '.talk is display:flex, which would otherwise outrank the hidden attribute');
  assert.match(css, /\.talk\s*\{[^}]*inset:\s*0[^}]*\}/, 'the pop-up covers the page with its backdrop while open');
  const h = agentsHtml({ canvas: 'X', data: { canvas: 'X', note: 'no desk' } });
  assert.match(h, /role="dialog" aria-modal="true"/);
});
