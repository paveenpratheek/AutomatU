import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindAsk, bindFormHtml, folderKey, needsMove, plannedHtml, repoOptions, saidOf } from './bindrepo.js';

const NEAR = [
  { repo: 'E:/x/Project NoteX', name: 'Project NoteX', gitx: true, canvas: 'Harness', totem: 'NoteX' },
  { repo: 'E:/x/Project Harness', name: 'Project Harness', gitx: true, canvas: null, totem: null },
  { repo: 'E:/x/Scratch', name: 'Scratch', gitx: false, canvas: null, totem: null },
  { repo: 'E:/x/Project AutomatU', name: 'Project AutomatU', gitx: true, canvas: 'AutomatU', totem: 'AutomatU Build Plan' },
];

test('a folder is keyed as the server keys it, however it is typed', () => {
  assert.equal(folderKey('e:\\x\\Project Harness\\'), 'E:/x/Project Harness');
  assert.equal(folderKey('"E:\\x\\Project Harness"'), 'E:/x/Project Harness');
  assert.equal(folderKey('  '), '');
});

test('the form offers the repositories not planned here first, each saying where it is linked and whether GitX has it', () => {
  const o = repoOptions(NEAR, 'Harness');
  assert.equal(o[o.length - 1].value, 'E:/x/Project NoteX', 'the one planned here comes last');
  assert.match(o.find((x) => x.value === 'E:/x/Scratch').label, /no GitX record/);
  assert.match(o.find((x) => x.value === 'E:/x/Project AutomatU').label, /linked to AutomatU > AutomatU Build Plan/);
});

test('a new repository is asked for with the totem picked; nothing is sent without both', () => {
  assert.match(bindAsk('Harness', {}, NEAR).problem, /Pick a repository/);
  assert.match(bindAsk('Harness', { repo: 'E:/x/Project Harness' }, NEAR).problem, /Pick the totem of Harness/);
  assert.deepEqual(bindAsk('Harness', { repo: 'E:/x/Project Harness', totem: 'RAGX' }, NEAR),
    { ask: { repo: 'E:/x/Project Harness', canvas: 'Harness', totem: 'RAGX', replace: false } });
});

test('a typed folder wins over the pick', () => {
  const r = bindAsk('Harness', { repo: 'E:/x/Scratch', path: 'E:\\x\\Project Harness', totem: 'RAGX' }, NEAR);
  assert.equal(r.ask.repo, 'E:/x/Project Harness');
});

test('moving a repository bound elsewhere asks first; the same link again is refused here', () => {
  const move = bindAsk('Harness', { repo: 'E:/x/Project AutomatU', totem: 'RAGX' }, NEAR);
  assert.match(move.confirm, /linked to AutomatU > AutomatU Build Plan now\. Move it to Harness > RAGX\?/);
  assert.equal(move.ask.replace, false, 'replace is set only once the user confirms');
  assert.match(bindAsk('Harness', { repo: 'E:/x/Project NoteX', totem: 'NoteX' }, NEAR).problem, /already linked to Harness > NoteX/);
  assert.match(bindAsk('Harness', { repo: 'E:/x/Project NoteX', totem: 'RAGX' }, NEAR).confirm, /Move it to Harness > RAGX/);
});

test('naming the plan totem of a binding that has none needs no confirm', () => {
  const near = [{ repo: 'E:/x/R', name: 'R', gitx: true, canvas: 'Harness', totem: null }];
  assert.deepEqual(bindAsk('Harness', { repo: 'E:/x/R', totem: 'RAGX' }, near).confirm, undefined);
});

test('the server\'s refusal for a repository bound elsewhere is known as a move', () => {
  assert.ok(needsMove('E:/x/R is already bound to the canvas AutomatU; pass replace to change it'));
  assert.ok(!needsMove('the canvas Harness has no totem named Nope with boxes in it'));
});

test('the panel lists what the canvas plans, and the form keeps what was picked', () => {
  assert.match(plannedHtml([]), /No repository yet/);
  const h = plannedHtml([{ repo: 'E:/x/Project NoteX', name: 'Project NoteX', totem: 'NoteX' }]);
  assert.match(h, /<b>Project NoteX<\/b><span class="mt">plan totem NoteX<\/span>/);
  const f = bindFormHtml('Harness', ['NoteX', 'RAGX'], NEAR, { repo: 'E:/x/Project Harness', totem: 'RAGX', path: 'E:\\y' });
  assert.match(f, /<option value="E:\/x\/Project Harness" selected>/);
  assert.match(f, /<option value="RAGX" selected>RAGX<\/option>/);
  assert.match(f, /value="E:\\y"/);
  assert.match(bindFormHtml('Harness', [], null, {}), /Finding repositories/);
  assert.match(bindFormHtml('A<b>', [], [], {}), /Pick a totem of A&lt;b&gt;/);
});

test('what the panel says after the server answers', () => {
  assert.match(saidOf({ repo: 'E:/x/R', canvas: 'Harness', totem: 'RAGX', changed: true, was: null }), /^R linked to Harness > RAGX\. Its first map/);
  assert.match(saidOf({ repo: 'E:/x/R', canvas: 'Harness', totem: 'RAGX', changed: true, was: 'AutomatU' }), /\(was AutomatU\)/);
  assert.equal(saidOf({ repo: 'E:/x/R', canvas: 'H', changed: false, problem: 'no such canvas' }), 'Not linked: no such canvas');
  assert.match(saidOf({ repo: 'E:/x/R', canvas: 'H', changed: false }), /already linked that way/);
});
