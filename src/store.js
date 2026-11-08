/*
 * AutomatU's metadata store: Postgres with pgvector (docker-compose.yml).
 * It holds what AutomatU itself makes - bindings, embeddings, placements and
 * map snapshots - and never the code, commits, thoughts or canvas text they
 * are about, which stay in GitX and on the canvas (t-8e84306eed).
 *
 * The schema is the files in migrations/, applied once each, in name order,
 * so each table arrives with the code that uses it (t-4f6e9e91e5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
export const DB_URL = process.env.AUTOMATU_DB_URL || 'postgres://automatu:automatu@127.0.0.1:5433/automatu';

let pool = null;
export function db() {
  if (!pool) pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
  return pool;
}

export async function close() {
  if (pool) { const p = pool; pool = null; await p.end(); }
}

/* Applies every migration not yet applied, each in its own transaction, and
   returns the names it applied. */
export async function migrate() {
  const c = await db().connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS applied_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM applied_migrations')).rows.map((r) => r.name));
    const applied = [];
    for (const name of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
        await c.query('INSERT INTO applied_migrations (name) VALUES ($1)', [name]);
        await c.query('COMMIT');
        applied.push(name);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error('migration ' + name + ' failed: ' + e.message);
      }
    }
    return applied;
  } finally {
    c.release();
  }
}
