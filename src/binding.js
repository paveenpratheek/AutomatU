/*
 * The binding: metadata saying which canvas plans a repository, and no other
 * (t-2125e729d7).
 * Set once when a project starts; changing it is a deliberate act (replace),
 * never a side effect of binding again.
 */
import { execFileSync } from 'node:child_process';
import { db } from './store.js';
import { readCanvasScript, sections } from './sources/canvas.js';

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
  const r = await db().query('SELECT repo, canvas, totem, bound_at FROM binding WHERE repo = $1', [repoKey(dir)]);
  return r.rows[0] || null;
}

/* Binds a repository to a canvas, and optionally names the totem on it that
   is the plan: code is then placed only under that totem's boxes and the
   rest of the canvas is extra information (t-ea1ec85327); with no totem
   named, every box is a candidate (t-04f422b90e). The canvas must exist, and
   the totem must be on it (both read through NoteX once to check). Binding
   again the same way changes nothing; naming the plan totem of a binding
   that has none is allowed; anything else that changes it is refused
   unless replace is set (t-83634eede9). */
export async function bind(dir, canvas, { totem = null, replace = false, check = readCanvasScript } = {}) {
  const repo = repoKey(dir);
  canvas = String(canvas || '').trim();
  totem = totem ? String(totem).trim() : null;
  if (!canvas) throw new Error('give the canvas name');
  const now = await bindingOf(repo);
  if (now && now.canvas === canvas && (now.totem || null) === totem) return { repo, canvas, totem, changed: false };
  const onlyNamingTotem = now && now.canvas === canvas && !now.totem && totem;
  if (now && !replace && !onlyNamingTotem) {
    throw new Error(repo + ' is already bound to the canvas ' + now.canvas + (now.totem ? ' (plan totem ' + now.totem + ')' : '') + '; pass replace to change it');
  }
  const script = await check(canvas);
  if (totem && typeof script === 'string' && !sections(script).some((s) => s.totem === totem)) {
    throw new Error('the canvas ' + canvas + ' has no totem named ' + totem + ' with boxes in it');
  }
  await db().query(
    'INSERT INTO binding (repo, canvas, totem) VALUES ($1, $2, $3) ON CONFLICT (repo) DO UPDATE SET canvas = EXCLUDED.canvas, totem = EXCLUDED.totem, bound_at = now()',
    [repo, canvas, totem]);
  return { repo, canvas, totem, changed: true, was: now ? now.canvas + (now.totem ? ' > ' + now.totem : '') : null };
}

/* The sections code may be placed under: the plan totem's boxes, or every
   box when the binding names no totem. */
export function planSections(binding, allSections) {
  return binding && binding.totem ? allSections.filter((s) => s.totem === binding.totem) : allSections;
}

export async function reposOf(canvas) {
  return (await db().query('SELECT repo FROM binding WHERE canvas = $1 ORDER BY repo', [canvas])).rows.map((r) => r.repo);
}
