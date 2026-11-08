#!/usr/bin/env node
/*
 * Calibration: sets the placement numbers on a canvas whose links are
 * already known, never on the project being placed.
 *
 * The Harness canvas explains three repositories and its boxes cite their
 * commits and thoughts. Those cites are taken out of the words alignment
 * reads (t-71b7c1ee34), so here they serve as the answer: a region is known
 * to belong to every box that cites one of its live commits or linked
 * thoughts. A region no box cites is not counted either way (t-85a7189ecf).
 *
 * Every set of numbers on a grid is scored as right - 2 x wrong over the
 * known regions: a region under a wrong box costs more than one left
 * waiting (t-a343e5943f). The best set is written to calibration.json,
 * with the self-test's pass mark, fixed before the self-test runs
 * (t-f5bda6198e).
 *
 * Usage: node scripts/calibrate.js [--write]   (reads only; binds nothing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, close } from '../src/store.js';
import { readRepo } from '../src/sources/gitx.js';
import { readCanvas } from '../src/sources/canvas.js';
import { regionVectors, sectionVectors } from '../src/profile.js';
import { rankSections, decide } from '../src/align.js';
import { MODEL } from '../src/embed.js';

const CANVAS = 'Harness';
const REPOS = ['E:/Coding CLI/Project Harness', 'E:/Coding CLI/Project NoteX', 'E:/Coding CLI/Project CanvasX'];
const WRONG_COST = 2;
const MAX_SHARED = 3;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'calibration.json');

/* A commit that wrote most of the lines of a large share of a repository's
   regions brought code in wholesale (CanvasX began as a copy of File
   Fabric: one commit, 906 of 1,128 regions). A box citing it says the code
   arrived, not what it is, so it is no evidence of which box explains a
   region (t-03642e423f). */
const BULK_SHARE = 0.3;
function bulkCommits(repo) {
  const n = {};
  for (const r of repo.regions) if (r.commits[0]) n[r.commits[0].sha] = (n[r.commits[0].sha] || 0) + 1;
  return new Set(Object.keys(n).filter((sha) => n[sha] > BULK_SHARE * repo.regions.length));
}

/* Which boxes each region is known to belong to, from the boxes' cites. */
function knownLinks(repo, sections) {
  const bulk = bulkCommits(repo);
  const out = new Map();
  for (const r of repo.regions) {
    const claims = new Set();
    for (const s of sections) {
      for (const c of s.cites) {
        const hit = c.startsWith('t-') ? r.thoughts.includes(c)
          : r.commits.some((x) => !bulk.has(x.sha) && (x.sha.startsWith(c) || c.startsWith(x.sha)));
        if (hit) { claims.add(s.address); break; }
      }
    }
    if (claims.size) out.set(r.id, claims);
  }
  return out;
}

/* Each section a region sits in counts once: right when a box citing the
   region is among them, wrong when not - so a Venn placement naming one
   right and one wrong section scores one of each. Coverage is the share of
   known regions with at least one right section (t-c045b3953e). */
function score(places, known) {
  let regions = 0, placements = 0, correct = 0, wrong = 0, covered = 0, shared = 0, top1 = 0, counted = 0;
  for (const p of places) {
    const k = known.get(p.region);
    if (!k) continue;
    counted++;
    if (k.has(p.best)) top1++;
    if (!p.sections.length) continue;
    regions++;
    if (p.sections.length > 1) shared++;
    let any = false;
    for (const sec of p.sections) { placements++; if (k.has(sec)) { correct++; any = true; } else wrong++; }
    if (any) covered++;
  }
  return { known: counted, placed: regions, shared, placements, correct, wrong,
    precision: placements ? correct / placements : 0, coverage: counted ? covered / counted : 0, top1: counted ? top1 / counted : 0 };
}

await migrate();
const canvas = await readCanvas(CANVAS);
const sv = await sectionVectors(canvas);
const all = [];
for (const dir of REPOS) {
  const t0 = Date.now();
  const repo = await readRepo(dir);
  const rv = await regionVectors(repo, dir);
  const known = knownLinks(repo, canvas.sections);
  for (const [id, v] of rv.vectors) all.push([dir + '|' + id, v, known.get(id)]);
  console.log(`${dir}: ${repo.regions.length} regions, ${rv.vectors.size} with a vector, ${known.size} known; ${rv.made} embedded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const vectors = new Map(all.map(([k, v]) => [k, v]));
const known = new Map(all.filter(([, , k]) => k).map(([k, , c]) => [k, c]));

/* Every cosine once, then the grid only decides from the rankings. */
const ranked = rankSections(vectors, sv.vectors);
const decideAll = (n) => ranked.map(({ region, ranked: r }) => ({ region, ...decide(r, n) }));
function search(overlaps) {
  let best = null;
  for (let s = 0; s <= 0.80001; s += 0.02) {
    for (let m = 0; m <= 0.10001; m += 0.0025) {
      for (const o of overlaps) {
        const n = { minScore: +s.toFixed(2), minMargin: +m.toFixed(4), overlap: o, maxShared: MAX_SHARED };
        const r = score(decideAll(n), known);
        const value = r.correct - WRONG_COST * r.wrong;
        if (!best || value > best.value) best = { ...n, value, ...r };
      }
    }
  }
  return best;
}
const single = search([0]);
const best = search([0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]);
const open = score(decideAll({ minScore: -1, minMargin: 0, overlap: 0 }), known);

const pct = (x) => (x * 100).toFixed(1) + '%';
const line = (r) => `${r.placed} regions placed (${r.shared} in more than one section), ${r.placements} placements: ${r.correct} right, ${r.wrong} wrong; precision ${pct(r.precision)}, coverage ${pct(r.coverage)}`;
console.log(`\n${known.size} known regions, ${canvas.sections.length} boxes; nearest box right (top-1): ${pct(open.top1)}`);
console.log(`single placement:  minScore ${single.minScore}, minMargin ${single.minMargin} - ${line(single)}`);
console.log(`with Venn overlap: minScore ${best.minScore}, minMargin ${best.minMargin}, overlap ${best.overlap} - ${line(best)}`);
for (const dir of REPOS) {
  const ks = new Map([...known].filter(([k]) => k.startsWith(dir + '|')));
  const r = score(decideAll(best).filter((p) => p.region.startsWith(dir + '|')), ks);
  console.log(`  ${dir}: known ${r.known}, ${line(r)}, top-1 ${pct(r.top1)}`);
}

if (process.argv.includes('--write')) {
  const round = (x) => +x.toFixed(4);
  fs.writeFileSync(OUT, JSON.stringify({
    made: new Date().toISOString().slice(0, 10), model: MODEL, canvas: CANVAS, repos: REPOS, wrongCost: WRONG_COST,
    minScore: best.minScore, minMargin: best.minMargin, overlap: best.overlap, maxShared: MAX_SHARED,
    result: { known: best.known, placed: best.placed, shared: best.shared, placements: best.placements, correct: best.correct, wrong: best.wrong,
      precision: round(best.precision), coverage: round(best.coverage), top1: round(open.top1) },
    /* The pass mark for aligning AutomatU's own code, fixed here, before it
       runs: precision at least 90%, coverage at least calibration's own
       (t-081195c7cf). */
    selfTest: { minPrecision: 0.9, minCoverage: Math.ceil(best.coverage * 100) / 100,
      truth: "the sections of the commits holding at least 20% of a region's lines, from the answer key kept outside the repository" },
  }, null, 2) + '\n');
  console.log('\nwritten ' + OUT);
}
await close();
