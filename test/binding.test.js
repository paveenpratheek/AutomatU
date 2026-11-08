/* Runs against its own database (automatu_test), made fresh for each run,
   never the store's real one (t-bee1ba60cb). Needs the store's container up. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const ADMIN = 'postgres://automatu:automatu@127.0.0.1:5433/automatu';
process.env.AUTOMATU_DB_URL = 'postgres://automatu:automatu@127.0.0.1:5433/automatu_test';
const { migrate, close } = await import('../src/store.js');
const { bind, bindingOf, reposOf, repoKey } = await import('../src/binding.js');

let repo;
const ok = async () => {};

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS automatu_test');
  await admin.query('CREATE DATABASE automatu_test');
  await admin.end();
  await migrate();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'automatu-bind-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
});

after(async () => {
  await close();
  fs.rmSync(repo, { recursive: true, force: true });
});

test('a repository is one key however its path is written', () => {
  const k = repoKey(repo);
  assert.equal(repoKey(repo + path.sep), k);
  assert.ok(!k.includes('\\'));
});

test('bind once, and again to the same canvas changes nothing', async () => {
  const a = await bind(repo, 'Plan A', { check: ok });
  assert.equal(a.changed, true);
  const b = await bind(repo, 'Plan A', { check: ok });
  assert.equal(b.changed, false);
  assert.equal((await bindingOf(repo)).canvas, 'Plan A');
});

test('a second canvas is refused unless replaced on purpose', async () => {
  await assert.rejects(bind(repo, 'Plan B', { check: ok }), /already bound to the canvas Plan A/);
  const r = await bind(repo, 'Plan B', { check: ok, replace: true });
  assert.equal(r.was, 'Plan A');
  assert.deepEqual(await reposOf('Plan B'), [repoKey(repo)]);
  assert.deepEqual(await reposOf('Plan A'), []);
});

test('a canvas that does not exist is not bound', async () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'automatu-bind-'));
  execFileSync('git', ['init', '-q'], { cwd: other });
  try {
    await assert.rejects(bind(other, 'Nope', { check: async () => { throw new Error('no such canvas'); } }), /no such canvas/);
    assert.equal(await bindingOf(other), null);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test('a folder that is not a repository is refused', () => {
  assert.throws(() => repoKey(os.tmpdir()), /not a git repository/);
});
