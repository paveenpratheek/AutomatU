#!/usr/bin/env node
/*
 * automatu bind <repo> <canvas> [--replace]   bind a repository to the canvas that plans it
 * automatu sources <repo>                      what AutomatU reads for it: regions, commits,
 *                                              thoughts, and the sections of its canvas
 */
import { migrate, close } from './store.js';
import { bind, bindingOf, repoKey } from './binding.js';
import { readRepo } from './sources/gitx.js';
import { readCanvas } from './sources/canvas.js';

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));

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
  } else {
    console.log('usage: automatu bind <repo> <canvas> [--replace] | automatu sources <repo>');
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error('automatu: ' + e.message); process.exitCode = 1; }).finally(close);
