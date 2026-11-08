/*
 * The bridge from Python to GitX, which is written in Node: calls GitX's own
 * codeRegions() on a repository at HEAD and prints its regions as JSON, so a
 * region in AutomatU is exactly a region GitX names (t-3dc4ff4d62).
 *
 * It hands over ids, line ranges, the lines each commit still holds, and the
 * thought ids cited in a region's comments - never the code text itself.
 *
 * With them go the uses: pairs of regions where code in one uses a name that
 * the other declares and its file imports from there, read from GitX's own
 * import graph (codeGraph). Two plan boxes whose code uses each other are
 * related in code (t-78db7e6b75). Only the pair of region ids goes out.
 *
 * Usage: node gitx_bridge.mjs <repo dir> <GitX dir>
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, gitxDir] = process.argv.slice(2);
const { codeRegions, codeGraph } = await import(pathToFileURL(path.join(gitxDir, 'mcp', 'tools', 'code-find.js')).href);
const TID = /\bt-[0-9a-f]{10}\b/g;

const all = codeRegions(dir).regions;
const regions = all.map((r) => ({
  file: r.file, name: r.name, kind: r.kind, from: r.from, to: r.to,
  commits: r.commits || {},
  cites: [...new Set(String(r.text || '').match(TID) || [])],
}));

const idOf = (r) => r.file + '::' + r.name;
const esc = (s) => s.replace(/[$]/g, '\\$');
/* The region that declares a name: its first line declares it. */
const declares = (r, n) => new RegExp('(?:^|\\s)(?:async\\s+)?(?:def|class|function\\*?|const|let|var)\\s+' + esc(n) + '(?![\\w$])|^' + esc(n) + '\\s*[=:(]').test(r.name);
const said = (text, n) => new RegExp('(?<![\\w$.])' + esc(n) + '(?![\\w$])').test(text);

/* GitX's import graph misses Python imports from a sub-package
 * ("from .sources.gitx import read_repo"), so those lines are read here too
 * and added to what it found. */
const PY_FROM = /^\s*from\s+(\.*)([\w.]*)\s+import\s+\(?([^)#]+)/;
function pythonImports(file, info, known) {
  const out = [];
  info.lines.forEach((l, i) => {
    const m = PY_FROM.exec(l);
    if (!m) return;
    const dots = m[1].length, mod = m[2] ? m[2].split('.') : [];
    let base = dots ? path.posix.dirname(file).split('/').filter(Boolean) : [];
    for (let k = 1; k < dots; k++) base.pop();
    const stem = [...base, ...mod].join('/');
    const target = [stem + '.py', stem + '/__init__.py'].find((t) => known.has(t));
    const names = m[3].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s) => /^[\w$]+$/.test(s));
    if (target && target !== file && names.length) out.push({ target, names, line: i + 1 });
  });
  return out;
}

const uses = [];
try {
  const g = codeGraph(dir);
  const known = new Set(g.files.keys());
  const seen = new Set();
  for (const [file, info] of g.files) {
    const imports = [...info.imports];
    if (file.endsWith('.py')) {
      for (const extra of pythonImports(file, info, known)) {
        if (!imports.some((x) => x.target === extra.target && x.line === extra.line)) imports.push(extra);
      }
    }
    for (const imp of imports) {
      const target = g.files.get(imp.target);
      if (!target) continue;
      for (const n of imp.names) {
        const decl = target.regions.filter((r) => declares(r, n));
        if (!decl.length) continue;
        /* The regions here that use the name, not the one holding the import line. */
        const users = info.regions.filter((r) => !(imp.line >= r.from && imp.line <= r.to) && said(String(r.text || ''), n));
        for (const u of users) for (const d of decl) {
          const k = idOf(u) + '\n' + idOf(d);
          if (!seen.has(k)) { seen.add(k); uses.push([idOf(u), idOf(d)]); }
        }
      }
    }
  }
} catch (_) { /* no import graph: uses stay empty, the regions still go out */ }

process.stdout.write(JSON.stringify({ regions, uses }));
