import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentsBoxHtml, dayOf, talkHtml } from './talk.js';

const NOW = new Date('2026-11-14T12:00:00');
const DATA = { agents: ['claude-workdesks-builder'], note: '', run: null, conversations: [
  { platform: 'claude', id: 'c1', title: 'Knowledge Desk fix', at: '2026-11-14T09:48:00+00:00' },
  { platform: 'antigravity', id: 'g1', title: 'Resume <Maker> flow', at: '2026-11-13 10:00:00+00:00' }] };

test('the agents box sits on the hex near its top left corner and names the canvas it opens', () => {
  const h = agentsBoxHtml({ l: 100, t: 50, w: 200, h: 173 }, 'Work Desks');
  assert.match(h, /data-talk="Work Desks"/);
  assert.match(h, /left:154\.0px;top:55\.0px/, 'on the top edge, a quarter in: beside the left corner, clear of the title');
});

test('a day is today or a date', () => {
  assert.equal(dayOf('2026-11-14T09:48:00', NOW), 'today');
  assert.equal(dayOf('2026-11-13 10:00:00+00:00', NOW), '13 Nov');
  assert.equal(dayOf('', NOW), '');
});

test('the window offers a task field and the last conversations, the newest picked', () => {
  const h = talkHtml({ canvas: 'Work Desks', data: DATA }, NOW);
  assert.match(h, /<b>claude-workdesks-builder<\/b><span class="mt">Work Desks<\/span>/);
  assert.match(h, /textarea id="tktext" name="text"/);
  assert.match(h, /value="claude:c1" data-talk-pick="claude:c1" checked>.*Knowledge Desk fix<\/span><span class="mt">today/s);
  assert.match(h, /tk-app antigravity" title="Antigravity">A<\/span><span class="tt">Resume &lt;Maker&gt; flow<\/span><span class="mt">13 Nov/);
  assert.match(talkHtml({ canvas: 'Work Desks', data: DATA, pick: 'antigravity:g1' }, NOW), /value="antigravity:g1" data-talk-pick="antigravity:g1" checked/);
  assert.match(h, /continues a copy, so the conversation in the app is not changed/);
  assert.doesNotMatch(h, /aria-label="Give the task" disabled/);
});

test('with nothing to continue from, or no project, the window says so and nothing can be sent', () => {
  const none = talkHtml({ canvas: 'Work Desks', data: { ...DATA, conversations: [] } }, NOW);
  assert.match(none, /no conversation on this project yet in the Claude app or Antigravity/);
  assert.match(none, /aria-label="Give the task" disabled/);
  assert.match(talkHtml({ canvas: 'Resume', data: { agents: [], conversations: [], note: 'This canvas plans no repository' } }), /plans no repository/);
  assert.match(talkHtml({ canvas: 'X', data: null }), /Reading the agent's conversations/);
});

test('a running task shows the words, the steps, the reply and the ask with its answers', () => {
  const run = { id: 't1', conversation: 'c1', text: 'Why is <tracking> slow?', state: 'asking', reply: 'Looking', error: '',
    steps: [{ id: 's', title: 'Read index.py', status: 'completed' }],
    ask: { title: 'Run tests', options: [{ id: 'allow', name: 'Allow once', kind: 'allow_once' }, { id: 'deny', name: 'Deny', kind: 'reject_once' }] } };
  const h = talkHtml({ canvas: 'Work Desks', data: DATA, run }, NOW);
  assert.match(h, /<div class="tk-q">Why is &lt;tracking&gt; slow\?<\/div>/);
  assert.match(h, /<li class="completed">Read index\.py<\/li>/);
  assert.match(h, /The agent asks to: <b>Run tests<\/b>.*data-talk-answer="allow">Allow once.*class="kbtn quiet" data-talk-answer="deny">Deny/s);
  assert.match(h, /Waiting on your answer · in a copy of “Knowledge Desk fix”/);
  assert.match(h, /data-talk-stop="1"/);
  assert.doesNotMatch(h, /textarea/, 'no new task while one runs');
  const done = talkHtml({ canvas: 'Work Desks', data: DATA, run: { ...run, state: 'done', ask: null, reply: 'It reads every box.' } }, NOW);
  assert.match(done, /It reads every box\..*Done.*data-talk-new="1"/s);
  assert.match(talkHtml({ canvas: 'Work Desks', data: DATA, run, dismissed: 't1' }, NOW), /textarea/, 'a task put away gives the field back');
});
