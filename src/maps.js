/*
 * Making a map: read a bound repository and its canvas, place its regions,
 * and keep the result as a snapshot (map_run + placement) - so a map made
 * today reads the same tomorrow even if the code or the canvas has moved
 * (t-42b6c9355c).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './store.js';
import { bindingOf, repoKey } from './binding.js';
import { readRepo } from './sources/gitx.js';
import { readCanvas } from './sources/canvas.js';
import { regionVectors, sectionVectors } from './profile.js';
import { placeRegions } from './align.js';
import { MODEL } from './embed.js';

const CALIBRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'calibration.json');

/* The calibrated numbers, or an error saying calibration has not been run
   (t-1cf7bb7eb7). */
export function calibrated() {
  try {
    const c = JSON.parse(fs.readFileSync(CALIBRATION, 'utf8'));
    return { minScore: c.minScore, minMargin: c.minMargin };
  } catch (_) {
    throw new Error('no calibration.json yet: run the calibration before placing code');
  }
}

export async function makeMap(dir, numbers = calibrated()) {
  const key = repoKey(dir);
  const b = await bindingOf(key);
  if (!b) throw new Error(key + ' is not bound to a canvas: automatu bind <repo> <canvas>');
  const [repo, canvas] = await Promise.all([readRepo(key), readCanvas(b.canvas)]);
  const [rv, sv] = [await regionVectors(repo, key), await sectionVectors(canvas)];
  const places = placeRegions(rv.vectors, sv.vectors, numbers);
  const placed = places.filter((p) => p.section).length;

  const c = await db().connect();
  try {
    await c.query('BEGIN');
    const run = (await c.query(
      'INSERT INTO map_run (repo, canvas, head, model, min_score, min_margin, regions, placed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, made_at',
      [key, b.canvas, repo.head, MODEL, numbers.minScore, numbers.minMargin, places.length, placed])).rows[0];
    for (const p of places) {
      await c.query('INSERT INTO placement (run_id, region, section, best, score, margin) VALUES ($1,$2,$3,$4,$5,$6)',
        [run.id, p.region, p.section, p.best, p.score, p.margin]);
    }
    await c.query('COMMIT');
    return { run: run.id, madeAt: run.made_at, repo: key, canvas: b.canvas, head: repo.head, regions: places.length, placed,
      sections: canvas.sections.map((s) => s.address), places, embedded: rv.made + sv.made };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/* The newest snapshot of a repository's map, as it was made. */
export async function latestMap(dir) {
  const key = repoKey(dir);
  const run = (await db().query('SELECT * FROM map_run WHERE repo = $1 ORDER BY made_at DESC, id DESC LIMIT 1', [key])).rows[0];
  if (!run) return null;
  const places = (await db().query('SELECT region, section, best, score, margin FROM placement WHERE run_id = $1 ORDER BY region', [run.id])).rows;
  return { run, places };
}
