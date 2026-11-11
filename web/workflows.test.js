import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStep, editorHtml, moveStep, normal, removeStep, same, setPlaced, toSave, wiresSvg } from './workflows.js';

const STEPS = [
  { id: 'read_canvas', words: 'Read the Resume canvas', actor: 'code', jobs: ['produce'], loops: false },
  { id: 'gather_for_resume', words: 'Ask Knowledge Desk', actor: 'code', jobs: ['produce'], loops: false },
  { id: 'write_resume', words: 'Write the resume', actor: 'agent', jobs: ['produce'], loops: true },
  { id: 'check_document', words: 'Check every citation', actor: 'code', jobs: ['produce'], loops: true },
  { id: 'documents', words: 'Make the documents', actor: 'code', jobs: ['produce'], loops: false },
  { id: 'write_version', words: 'Record the version', actor: 'agent', jobs: ['produce'], loops: false },
];
const CAT = Object.fromEntries(STEPS.map((s) => [s.id, s]));
const DEFAULT = [{ step: 'read_canvas' }, { step: 'gather_for_resume' }, { step: 'write_resume' },
  { step: 'check_document', back_to: 'write_resume' }, { step: 'documents' }, { step: 'write_version' }];

test('steps move, go and come, and a back-to never points ahead of its step', () => {
  const d = normal(DEFAULT);
  assert.deepEqual(toSave(d), DEFAULT, 'what the desk gave comes back the same');
  const moved = moveStep(d, 3, -1);          // check document before write resume: its back-to now points ahead
  assert.deepEqual(moved.map((p) => p.step).slice(2, 4), ['check_document', 'write_resume']);
  assert.equal(moved[2].back_to, null);
  const gone = removeStep(d, 2);              // write resume out: check document's back-to goes with it
  assert.equal(gone.find((p) => p.step === 'check_document').back_to, null);
  assert.deepEqual(addStep(gone, 'write_resume').map((p) => p.step).slice(-1), ['write_resume']);
  assert.equal(addStep(d, 'documents').length, d.length, 'a step is there once');
  assert.deepEqual(moveStep(d, 0, -1), d, 'nothing moves past the ends');
  const stopped = setPlaced(d, 5, { stop_before: true });
  assert.deepEqual(toSave(stopped)[5], { step: 'write_version', stop_before: true });
  assert.deepEqual(toSave(setPlaced(d, 2, { back_to: 'write_resume', tries: 4 }))[2], { step: 'write_resume', tries: 4 },
    'a back-to to itself is the same as none');
  assert.equal(same(d, DEFAULT), true);
  assert.equal(same(stopped, DEFAULT), false);
});

test('the flow is drawn with its wires, its loops back, and the stops for the user', () => {
  const svg = wiresSvg(normal(DEFAULT.map((p, i) => (i === 4 ? { ...p, stop_before: true } : p))), CAT);
  assert.equal((svg.match(/class="wf-wire"/g) || []).length, 5, 'one wire between each two steps');
  assert.equal((svg.match(/class="wf-loop"/g) || []).length, 2, 'write resume to itself, check document back to it');
  assert.equal((svg.match(/class="wf-stopmark"/g) || []).length, 1);
  assert.match(svg, /problems · up to 3×/);
});

const DATA = {
  catalogue: { desk: 'resume-maker', steps: STEPS, jobs: { produce: { job: 'produce', steps: DEFAULT } },
    rules: ['Nothing is written or made before its citations are checked.'], max_tries: 5,
    grants: { writes: ['Resume'], asks: ['knowledge-desk'], from: 'config' }, desks: ['knowledge-desk'] },
  current: { desk: 'resume-maker', jobs: {}, grants: null },
  history: { jobs: { produce: [{ version: 1, steps: DEFAULT, saved_at: '2026-11-11T10:00:00Z', note: 'first <try>' }] }, grants: [] },
};
const RM = { url: 'http://127.0.0.1:7795', up: true, live: {}, card: { name: 'Resume Maker' } };

test('the tab shows the desks, the job, its flow, what it can add, the rules, the versions and the grants', () => {
  const wf = { desks: [RM, { url: 'http://x:2', up: false, card: null }], desk: RM.url, data: DATA, job: 'produce',
    draft: normal(DEFAULT), grants: { writes: ['Resume'], asks: ['knowledge-desk'] } };
  const h = editorHtml(wf, Date.parse('2026-11-11T10:05:00Z'));
  assert.match(h, /data-wf="desk" data-v="http:\/\/127\.0\.0\.1:7795">Resume Maker/);
  assert.match(h, /http:\/\/x:2 · not running/);
  assert.match(h, /produce<span class="wf-ver">the default<\/span>/);
  assert.match(h, /the desk's default runs now/);
  assert.match(h, /class="wf-save" data-wf="save" disabled/, 'nothing to save until something changes');
  assert.match(h, /Nothing is written or made before its citations are checked/);
  assert.match(h, /v1<\/button> <span class="wf-who">5 min ago<\/span> · first &lt;try&gt;/);
  assert.match(h, /May write:<\/span><span class="wf-chip">Resume/);
  assert.match(h, /data-wf="ask" data-v="knowledge-desk" checked/);
  const changed = editorHtml({ ...wf, draft: removeStep(normal(DEFAULT), 5), problems: ['documents would <write>'] });
  assert.match(changed, /changed, not saved/);
  assert.match(changed, /data-wf="add" data-v="write_version"/);
  assert.match(changed, /The desk refused it:.*documents would &lt;write&gt;/s);
  assert.doesNotMatch(changed, /class="wf-save" data-wf="save" disabled/);
});

test('before a desk is picked or read, the tab says so', () => {
  assert.match(editorHtml(null), /Looking for the desks/);
  assert.match(editorHtml({ desks: [RM] }), /Pick a desk/);
  assert.match(editorHtml({ desks: [RM], desk: RM.url }), /Reading the desk's steps/);
  assert.match(editorHtml({ desks: [RM], desk: RM.url, error: 'Could not read the desk: <x>' }), /&lt;x&gt;/);
});
