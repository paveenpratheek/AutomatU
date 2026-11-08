/*
 * The bridge from Python to GitX, which is written in Node: calls GitX's own
 * codeRegions() on a repository at HEAD and prints its regions as JSON, so a
 * region in AutomatU is exactly a region GitX names (t-3dc4ff4d62).
 *
 * It hands over ids, line ranges, the lines each commit still holds, and the
 * thought ids cited in a region's comments - never the code text itself.
 *
 * Usage: node gitx_bridge.mjs <repo dir> <GitX dir>
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, gitxDir] = process.argv.slice(2);
const { codeRegions } = await import(pathToFileURL(path.join(gitxDir, 'mcp', 'tools', 'code-find.js')).href);
const TID = /\bt-[0-9a-f]{10}\b/g;

const regions = codeRegions(dir).regions.map((r) => ({
  file: r.file, name: r.name, kind: r.kind, from: r.from, to: r.to,
  commits: r.commits || {},
  cites: [...new Set(String(r.text || '').match(TID) || [])],
}));
process.stdout.write(JSON.stringify({ regions }));
