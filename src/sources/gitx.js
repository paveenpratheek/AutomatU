/*
 * Reads a repository's GitX record as AutomatU needs it: every code region at
 * HEAD, the commits whose lines are still in it, and the thoughts linked to
 * those commits or cited in its comments.
 *
 * Read when asked, never copied: what comes back lives only in memory, and
 * the region's own code text is not returned at all - a region is judged by
 * its commit messages and thoughts, not by its lines (t-b9795a5188).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const GITX_DIR = process.env.GITX_DIR || 'E:/Coding CLI/Project GitX';

/* Agent workflow scaffolding, not the project's own code or docs. */
const SCAFFOLD = /^(\.claude|\.agents|\.agent)\/|^(AGENTS|CLAUDE|GEMINI)\.md$/;
const TID = /\bt-[0-9a-f]{10}\b/g;
const TRAILER = /^[A-Za-z][A-Za-z0-9-]*: \S/;

/* GitX's own region splitter, so a region here is exactly a region GitX
   names and scores - one definition of "a region" across both tools
   (t-d581ad5b69). */
let codeRegionsFn = null;
async function gitxCodeRegions() {
  if (!codeRegionsFn) {
    const mod = await import(pathToFileURL(path.join(GITX_DIR, 'mcp', 'tools', 'code-find.js')).href);
    codeRegionsFn = mod.codeRegions;
  }
  return codeRegionsFn;
}

const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });

/* A commit message without its trailer block. Trailers are bookkeeping for
   the commit graph; AutomatU never reads them, so an independently made
   repository (which has none) is judged the same way as one built here
   (t-38c7aa4f42). */
export function withoutTrailers(message) {
  const paras = String(message || '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const last = paras[paras.length - 1] || '';
  const lines = last.split('\n').filter((l) => l.trim());
  /* Every line "Key: value", and at least one key hyphenated as real trailers
     are (GitX-Thoughts, Co-Authored-By) - so a closing line of prose that
     happens to start "Note: ..." is kept (t-40ab23ab7b). */
  const isBlock = lines.length && lines.every((l) => TRAILER.test(l.trim())) && lines.some((l) => /^[A-Za-z0-9]+-[A-Za-z0-9-]*:/.test(l.trim()));
  if (paras.length > 1 && isBlock) paras.pop();
  return paras.join('\n\n').trim();
}

/* Every commit reachable from HEAD: short sha -> subject and body (trailers removed). */
export function readCommits(dir) {
  const out = {};
  const raw = git(dir, ['log', '--format=%H%x1f%as%x1f%B%x1e']);
  for (const rec of raw.split('\x1e')) {
    const [sha, date, body] = rec.replace(/^\s+/, '').split('\x1f');
    if (!sha || !body) continue;
    const msg = withoutTrailers(body);
    const nl = msg.indexOf('\n');
    out[sha.slice(0, 12)] = { sha: sha.slice(0, 12), date, subject: nl < 0 ? msg : msg.slice(0, nl), body: nl < 0 ? '' : msg.slice(nl + 1).trim() };
  }
  return out;
}

/* Every thought on record, from both graphs: settled (.gitx/thoughts) and
   waiting (.gitx/context/thoughts). Status travels with it, so whoever reads
   a thought can tell a settled decision from a rejected or superseded one. */
export function readThoughts(dir) {
  const out = {};
  for (const [store, graph] of [['thoughts', 'settled'], [path.join('context', 'thoughts'), 'waiting']]) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, '.gitx', store)); } catch (_) { continue; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, '.gitx', store, n), 'utf8')); } catch (_) { continue; }
      if (!j || !j.id) continue;
      out[j.id] = {
        id: j.id, graph, kind: j.kind, outcome: j.outcome, text: j.text || '',
        commit: ((j.anchor && j.anchor.commit) || '').slice(0, 12),
        resulted: ((j.resulted_in && j.resulted_in.commit) || '').slice(0, 12),
        links: (j.links || []).filter((l) => l && l.to).map((l) => ({ type: l.type, to: l.to })),
      };
    }
  }
  return out;
}

/* The whole read: regions at HEAD, each with its live commits (most lines
   first) and its linked thoughts, plus the commits and thoughts they name. */
export async function readRepo(dir) {
  const codeRegions = await gitxCodeRegions();
  const head = git(dir, ['rev-parse', 'HEAD']).trim().slice(0, 12);
  const commits = readCommits(dir);
  const thoughts = readThoughts(dir);

  /* A thought is linked to a commit when it was settled by it or recorded at it. */
  const byCommit = {};
  for (const t of Object.values(thoughts)) {
    for (const c of new Set([t.resulted, t.commit].filter(Boolean))) (byCommit[c] = byCommit[c] || []).push(t.id);
  }

  const regions = [];
  for (const r of codeRegions(dir).regions) {
    if (SCAFFOLD.test(r.file)) continue;
    const live = Object.entries(r.commits || {}).sort((a, b) => b[1] - a[1])
      .map(([sha, lines]) => ({ sha: sha.slice(0, 12), lines }))
      .filter((c) => commits[c.sha]);
    const cited = [...new Set(String(r.text || '').match(TID) || [])].filter((t) => thoughts[t]);
    const viaCommit = live.flatMap((c) => byCommit[c.sha] || []);
    regions.push({
      id: r.file + '::' + r.name, file: r.file, name: r.name, kind: r.kind, from: r.from, to: r.to,
      commits: live, thoughts: [...new Set([...cited, ...viaCommit])],
    });
  }
  return { dir, head, regions, commits, thoughts };
}
