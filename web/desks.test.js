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
