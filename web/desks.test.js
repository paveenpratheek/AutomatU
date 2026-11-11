import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, cardHtml, desksHtml, runLine, sitter, stepName } from './desks.js';

const NOW = Date.parse('2026-11-11T10:05:00Z');
const RM = {
  url: 'http://127.0.0.1:7795', up: true, note: '',
  card: { name: 'Resume Maker', description: "Keeps the user's resume", version: '1.0',
    skills: [{ id: 'analyse-for-job', name: 'Analyse for a job', description: 'matches and gaps', examples: ['Analyse my resume for this posting.'] }] },
  live: { agent: 'claude', model: 'claude-sonnet-5-5',
    runs: [{ task_id: 't1', job: 'remove-analysis', state: 'waiting', started_at: '2026-11-11T10:00:00Z',
      step: { step: 'remove_analysis', actor: 'code', status: 'waiting', started_at: '2026-11-11T10:00:01Z' } }],
    waiting: [{ task_id: 't1', kind: 'question', text: 'Remove "Analysis: Google gen-AI Role"? <yes/no>', job: 'remove-analysis', asked_at: '2026-11-11T10:02:00Z' }] },
};

test('a step and a time read as words', () => {
  assert.equal(stepName('gather_for_posting'), 'gather for posting');
  assert.equal(ago('2026-11-11T10:04:50Z', NOW), 'just now');
  assert.equal(ago('2026-11-11T10:02:00Z', NOW), '3 min');
  assert.equal(ago('2026-11-11T07:05:00Z', NOW), '3 h');
  assert.equal(ago('not a time', NOW), '');
});

test('who sits at a desk', () => {
  assert.equal(sitter(RM.live), 'Claude · claude-sonnet-5-5');
  assert.equal(sitter({ agent: 'agy' }), 'Gemini through agy');
  assert.equal(sitter(null), '');
});

test('a run says its job, the step it is on, who does it, and that it waits on the user', () => {
  const line = runLine(RM.live.runs[0]);
  assert.match(line, /<b>remove-analysis<\/b> · remove analysis <span class="dk-who">\(the desk\)<\/span>/);
  assert.match(line, /waiting on you/);
  assert.match(runLine({ job: 'chat', state: 'running', step: { step: 'answer', actor: 'agent', status: 'running' } }), /answering a message.*\(the agent\).*now/);
});

test('a card shows what waits on the user, escaped, and says answers go from the chat', () => {
  const h = cardHtml(RM, NOW);
  assert.match(h, /class="dk asking"/);
  assert.match(h, /Waiting on you \(1\)/);
  assert.match(h, /&lt;yes\/no&gt;/, 'what a desk says is never taken as markup');
  assert.match(h, /Answer from your chat/);
  assert.match(h, /Analyse for a job/);
  assert.match(h, /3 min/);
});

test('a desk not running, or one that keeps no runs, still has its card', () => {
  assert.match(cardHtml({ url: 'http://x:1', up: false, card: null, live: null, note: 'not running' }), /class="dk off".*not running/);
  const kd = cardHtml({ url: 'http://x:2', up: true, card: { name: 'Knowledge Desk', description: 'answers', skills: [] }, live: null, note: 'keeps no record of its runs' });
  assert.match(kd, /Knowledge Desk/);
  assert.match(kd, /keeps no record of its runs/);
});

test('the tab counts everything waiting on the user', () => {
  assert.match(desksHtml({ desks: [RM, RM] }, NOW), /2 waiting on you/);
  assert.match(desksHtml({ desks: [] }), /No desks are listed/);
});

test('only a running job can be interrupted, and the button names its desk and task', async () => {
  const { interruptButton } = await import('./desks.js');
  assert.equal(interruptButton(RM.live.runs[0], RM.url), '', 'a job waiting on the user has no Interrupt');
  const running = { task_id: 't2', job: 'analyse-for-job', state: 'running' };
  const b = interruptButton(running, RM.url);
  assert.match(b, /data-int-desk="http:\/\/127\.0\.0\.1:7795"/);
  assert.match(b, /data-int-task="t2"/);
  assert.match(b, />Interrupt</);
  assert.match(cardHtml({ ...RM, live: { ...RM.live, runs: [running], waiting: [] } }, NOW), /class="dk-int"/);
  assert.match(desksHtml({ desks: [RM], said: 'Interrupted <x>' }, NOW), /Interrupted &lt;x&gt;/);
});

const RUN = {
  desk: 'http://127.0.0.1:7795', task_id: 't3', job: 'analyse-for-job', state: 'running', started_at: '2026-11-11T10:00:00Z',
  ended_at: '', said: '',
  steps: [
    { step: 'read_canvas', actor: 'code', status: 'done', started_at: '2026-11-11T10:00:00Z', ended_at: '2026-11-11T10:00:01Z', tries: null, detail: {} },
    { step: 'gather_for_posting', actor: 'code', status: 'done', started_at: '2026-11-11T10:00:01Z', ended_at: '2026-11-11T10:00:09Z', tries: null,
      detail: { cited: ['h:Work Desks/tm-1/2. Knowledge Desk', 'h:AutomatU/tm-2/14. Typed data'], map: '130' } },
    { step: 'judge', actor: 'agent', status: 'problems', started_at: '2026-11-11T10:00:09Z', ended_at: '2026-11-11T10:01:09Z', tries: 1, detail: { problems: 2 } },
    { step: 'write_analysis', actor: 'agent', status: 'running', started_at: '2026-11-11T10:04:00Z', ended_at: '', tries: null, detail: {} },
  ],
  asks: [{ kind: 'interrupt', text: 'You interrupted Resume Maker.', asked_at: '2026-11-11T10:02:00Z', answered_at: '2026-11-11T10:03:00Z', answer: 'carry on' }],
};

test('a run is drawn as its own path: done steps with their time, the running one lit', async () => {
  const { took, pathHtml } = await import('./desks.js');
  assert.equal(took('2026-11-11T10:00:01Z', '2026-11-11T10:00:09Z'), '8 s');
  assert.equal(took('2026-11-11T10:00:00Z', '2026-11-11T10:02:00Z'), '2 min');
  assert.equal(took('2026-11-11T10:00:00Z', ''), '');
  const p = pathHtml(RUN.steps, NOW);
  assert.match(p, /dk-st-done"><b>gather for posting<\/b><span>the desk · done · 8 s/);
  assert.match(p, /dk-st-problems"><b>judge<\/b><span>the agent · went back · 1 min/);
  assert.match(p, /dk-st-running"><b>write analysis<\/b><span>the agent · now · 1 min so far/);
  const waiting = pathHtml([{ step: 'ask', actor: 'user', status: 'waiting', started_at: '', ended_at: '', detail: { question: 'Which <posting>?' } }]);
  assert.match(waiting, /waiting on you.*<em>Which &lt;posting&gt;\?<\/em>/);
});

test('the run view tells each step in full and everything it asked', async () => {
  const { runViewHtml, stepFacts } = await import('./desks.js');
  assert.deepEqual(stepFacts({ tries: 2, detail: { problems: 1, recorded: 'Resume > T > A', files: ['cv-v2.pdf'] } }),
    ['try 2', '1 problem sent back', 'recorded at Resume &gt; T &gt; A', 'made cv-v2.pdf']);
  const h = runViewHtml(RM, RUN, NOW);
  assert.match(h, /<b>Resume Maker<\/b> - analyse-for-job/);
  assert.match(h, /2 hexes cited/);
  assert.match(h, /as of map 130/);
  assert.match(h, /You answered: carry on/);
  assert.match(h, /data-run-back/);
  assert.match(runViewHtml(RM, null), /Reading the run/);
});

test('runs that wait, fail or finish ring the bell once, and old ones stay quiet', async () => {
  const { deskEvents, eventsHtml } = await import('./desks.js');
  const answer = { desks: [{ ...RM, recent: [
    { task_id: 'a', job: 'remove-analysis', state: 'waiting', started_at: '2026-11-11T10:00:00Z', ended_at: '', said: 'Remove it?' },
    { task_id: 'b', job: 'analyse-for-job', state: 'failed', started_at: '2026-11-11T09:00:00Z', ended_at: '2026-11-11T09:01:00Z', said: 'no posting' },
    { task_id: 'c', job: 'chat', state: 'running', started_at: '2026-11-11T10:04:00Z', ended_at: '', said: '' }] }] };
  const ev = deskEvents(answer);
  assert.deepEqual(ev.map((e) => [e.task, e.state]), [['a', 'waiting'], ['b', 'failed']], 'a running job does not ring');
  const html = eventsHtml(ev, new Set([ev[1].key]), NOW);
  assert.match(html, /dk-ev new" data-run-desk="http:\/\/127\.0\.0\.1:7795" data-run-task="a"/);
  assert.match(html, /<b>Resume Maker<\/b>: remove-analysis is waiting on you/);
  assert.doesNotMatch(html, /dk-ev new" data-run-desk="[^"]*" data-run-task="b"/, 'one already seen is not new');
  const again = deskEvents({ desks: [{ ...RM, recent: [{ ...answer.desks[0].recent[0], said: 'Keep it?' }] }] });
  assert.notEqual(again[0].key, ev[0].key, 'a second question on the same task rings again');
  assert.equal(eventsHtml([], new Set()), '');
});

test('a card lists its runs lately, each opening its run view', () => {
  const h = cardHtml({ ...RM, recent: [{ task_id: 't1', job: 'remove-analysis', state: 'waiting', started_at: '2026-11-11T10:00:00Z' },
    { task_id: 'old', job: 'produce', state: 'completed', started_at: '2026-11-11T08:00:00Z', ended_at: '2026-11-11T08:05:00Z' }] }, NOW);
  assert.match(h, /<h4>Lately<\/h4>/);
  assert.match(h, /data-run-task="old"[^>]*><b>produce<\/b> · <span class="dk-done">completed/);
  assert.equal((h.match(/data-run-task="t1"/g) || []).length, 1, 'a job going now is under Now only');
});
