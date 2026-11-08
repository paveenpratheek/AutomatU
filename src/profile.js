/*
 * What a region and a section are judged by, as vectors.
 *
 * A region: the messages of the commits whose lines are still in it,
 * weighted by those lines, mixed half and half with the thoughts linked to
 * it. A thought cited in the region's own comments counts in full; one
 * linked through a commit counts as much as that commit wrote of the region
 * (t-4c1745c814). Thoughts that are rejected, stashed or superseded are left
 * out: they say what the code does not do (t-35ef1da3a9).
 *
 * A section: its own words.
 */
import { embedCached, normalise } from './embed.js';

const DROP = new Set(['rejected', 'stashed']);

export function liveThoughts(thoughts) {
  const superseded = new Set();
  for (const t of Object.values(thoughts)) for (const l of t.links) if (l.type === 'supersedes') superseded.add(l.to);
  const live = {};
  for (const t of Object.values(thoughts)) if (!DROP.has(t.outcome) && !superseded.has(t.id)) live[t.id] = t;
  return live;
}

const commitText = (c) => (c.subject + (c.body ? '\n\n' + c.body : '')).trim();

/* A weighted sum of vectors, normalised; null when nothing has weight. */
export function mix(parts) {
  let out = null;
  for (const { v, w } of parts) {
    if (!v || !w) continue;
    if (!out) out = new Array(v.length).fill(0);
    for (let i = 0; i < v.length; i++) out[i] += v[i] * w;
  }
  return out ? normalise(out) : null;
}

/* repo: what readRepo gave; key: the repository's binding key. Returns the
   vector of every region something was said about, and how many embeddings
   had to be made. */
export async function regionVectors(repo, key) {
  const live = liveThoughts(repo.thoughts);
  const items = [];
  for (const c of Object.values(repo.commits)) items.push({ key: 'commit:' + key + ':' + c.sha, text: commitText(c) });
  for (const t of Object.values(live)) items.push({ key: 'thought:' + key + ':' + t.id, text: t.text });
  const { vectors, made } = await embedCached(items);

  const out = new Map();
  for (const r of repo.regions) {
    const total = r.commits.reduce((s, c) => s + c.lines, 0) || 1;
    const share = new Map(r.commits.map((c) => [c.sha, c.lines / total]));
    const commitPart = mix(r.commits.map((c) => ({ v: vectors.get('commit:' + key + ':' + c.sha), w: share.get(c.sha) })));
    const thoughtPart = mix(r.thoughts.filter((id) => live[id]).map((id) => {
      const t = live[id];
      const viaCommit = Math.max(share.get(t.resulted) || 0, share.get(t.commit) || 0);
      return { v: vectors.get('thought:' + key + ':' + id), w: viaCommit || 1 };
    }));
    const v = mix([{ v: commitPart, w: 0.5 }, { v: thoughtPart, w: 0.5 }]);
    if (v) out.set(r.id, v);
  }
  return { vectors: out, made };
}

export async function sectionVectors(canvas) {
  const key = (s) => 'section:' + canvas.name + ':' + s.address;
  const { vectors, made } = await embedCached(canvas.sections.map((s) => ({ key: key(s), text: s.words })));
  const out = new Map();
  for (const s of canvas.sections) { const v = vectors.get(key(s)); if (v) out.set(s.address, normalise(v)); }
  return { vectors: out, made };
}
