#!/usr/bin/env node
/*
 * automatu bind <repo> <canvas> [--replace]   bind a repository to the canvas that plans it
 * automatu sources <repo>                      what AutomatU reads for it: regions, commits,
 *                                              thoughts, and the sections of its canvas
 * automatu align <repo>                        place its regions under its canvas's sections
 *                                              and keep the map as a snapshot
 * automatu serve [--port=7790]                 the map view, on 127.0.0.1
 */
import { migrate, close } from './store.js';
import { bind, bindingOf, repoKey } from './binding.js';
import { readRepo } from './sources/gitx.js';
import { readCanvas } from './sources/canvas.js';
import { makeMap } from './maps.js';
import { serve } from './serve.js';

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
const USAGE = 'usage: automatu bind <repo> <canvas> [--replace] | automatu sources <repo> | automatu align <repo> | automatu serve [--port=7790]';

async function main() {
  await migrate();
  if (cmd === 'bind') {
    const r = await bind(pos[0], pos[1], { replace: flags.has('--replace') });
    console.log(r.changed ? `bound ${r.repo} to ${r.canvas}${r.was ? ' (was ' + r.was + ')' : ''}` : `${r.repo} is already bound to ${r.canvas}`);
  } else if (cmd === 'sources') {
    const b = await bindingOf(pos[0]);
    const repo = await readRepo(repoKey(pos[0]));
    const withThoughts = repo.regions.filter((r) => r.thoughts.length).length;
    console.log(`${repo.dir} at ${repo.head}: ${repo.regions.length} regions (${withThoughts} with linked thoughts), ${Object.keys(repo.commits).length} commits, ${Object.keys(repo.thoughts).length} thoughts`);
    if (!b) { console.log('not bound to a canvas yet: automatu bind <repo> <canvas>'); return; }
    const canvas = await readCanvas(b.canvas);
    console.log(`canvas ${b.canvas}: ${canvas.sections.length} sections`);
    for (const s of canvas.sections) console.log('  ' + s.address);
  } else if (cmd === 'align') {
    const m = await makeMap(pos[0]);
    console.log(`map ${m.run}: ${m.repo} at ${m.head} on ${m.canvas} - ${m.placed} of ${m.regions} regions placed, ${m.regions - m.placed} not yet placed`);
    const by = {};
    for (const p of m.places) for (const s of p.sections) by[s] = (by[s] || 0) + 1;
    const shared = m.places.filter((p) => p.sections.length > 1).length;
    for (const s of m.sections) console.log(`  ${String(by[s] || 0).padStart(4)}  ${s}`);
    if (shared) console.log(`  ${shared} of the placed regions sit in more than one section`);
  } else if (cmd === 'serve') {
    const port = Number((args.find((a) => a.startsWith('--port=')) || '').slice(7)) || 7790;
    await serve({ port });
    console.log(`map view on http://127.0.0.1:${port}  (Ctrl+C to stop)`);
    await new Promise(() => {}); /* serve until stopped */
  } else {
    console.log(USAGE);
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error('automatu: ' + e.message); process.exitCode = 1; }).finally(close);
