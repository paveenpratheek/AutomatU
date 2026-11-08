/*
 * The binding: metadata saying which canvas plans a repository, and no other
 * (t-2125e729d7).
 * Set once when a project starts; changing it is a deliberate act (replace),
 * never a side effect of binding again.
 */
import { execFileSync } from 'node:child_process';
import { db } from './store.js';
import { readCanvasScript } from './sources/canvas.js';

/* A repository by its top folder, written one way: forward slashes, the
   drive letter in capitals - so E:\x and e:/x/ are one repository
   (t-b8f9b34f54). */
export function repoKey(dir) {
  let top;
  try {
    top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    throw new Error(dir + ' is not a git repository');
  }
  return top.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ':');
}

export async function bindingOf(dir) {
  const r = await db().query('SELECT repo, canvas, bound_at FROM binding WHERE repo = $1', [repoKey(dir)]);
  return r.rows[0] || null;
}

/* Binds a repository to a canvas. The canvas must exist (it is read through
   NoteX once to check). Binding to the same canvas again changes nothing;
   to another one is refused unless replace is set (t-83634eede9). */
export async function bind(dir, canvas, { replace = false, check = readCanvasScript } = {}) {
  const repo = repoKey(dir);
  canvas = String(canvas || '').trim();
  if (!canvas) throw new Error('give the canvas name');
  const now = await bindingOf(repo);
  if (now && now.canvas === canvas) return { repo, canvas, changed: false };
  if (now && !replace) throw new Error(repo + ' is already bound to the canvas ' + now.canvas + '; pass replace to bind it to ' + canvas);
  await check(canvas);
  await db().query(
    'INSERT INTO binding (repo, canvas) VALUES ($1, $2) ON CONFLICT (repo) DO UPDATE SET canvas = EXCLUDED.canvas, bound_at = now()',
    [repo, canvas]);
  return { repo, canvas, changed: true, was: now ? now.canvas : null };
}

export async function reposOf(canvas) {
  return (await db().query('SELECT repo FROM binding WHERE canvas = $1 ORDER BY repo', [canvas])).rows.map((r) => r.repo);
}
