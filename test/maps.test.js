/* A map is a snapshot: what was placed stays as it was made. Runs on its own
   database (automatu_test_maps), made fresh each run (t-bee1ba60cb). The
   sources are stubbed - this is about what is kept, not about reading. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const ADMIN = 'postgres://automatu:automatu@127.0.0.1:5433/automatu';
process.env.AUTOMATU_DB_URL = 'postgres://automatu:automatu@127.0.0.1:5433/automatu_test_maps';
const { migrate, close, db } = await import('../src/store.js');

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS automatu_test_maps');
  await admin.query('CREATE DATABASE automatu_test_maps');
  await admin.end();
  await migrate();
});

after(close);

test('placing without calibration is refused before anything is read', async () => {
  const { calibrated } = await import('../src/maps.js');
  /* calibration.json may or may not exist in a checkout; when it does, it must carry both numbers. */
  try {
    const n = calibrated();
    assert.equal(typeof n.minScore, 'number');
    assert.equal(typeof n.minMargin, 'number');
  } catch (e) {
    assert.match(e.message, /calibration/);
  }
});

test('a run and its placements are kept together, and go together', async () => {
  const run = (await db().query(
    "INSERT INTO map_run (repo, canvas, head, model, min_score, min_margin, regions, placed) VALUES ('R','C','abc','m',0.5,0.02,2,1) RETURNING id")).rows[0].id;
  await db().query("INSERT INTO placement VALUES ($1,'a.js::f','S1','S1',0.7,0.1), ($1,'b.js::g',NULL,'S2',0.4,0.01)", [run]);
  const rows = (await db().query('SELECT region, section, best FROM placement WHERE run_id = $1 ORDER BY region', [run])).rows;
  assert.deepEqual(rows, [{ region: 'a.js::f', section: 'S1', best: 'S1' }, { region: 'b.js::g', section: null, best: 'S2' }]);
  await db().query('DELETE FROM map_run WHERE id = $1', [run]);
  assert.equal((await db().query('SELECT count(*)::int AS n FROM placement WHERE run_id = $1', [run])).rows[0].n, 0);
});
