/*
 * The Code map's layout, as the SearchX prototype drew it (its
 * build_hexlayer method), computed in the page for one repository's map, with
 * no DOM so it can be tested in Node.
 *
 *   hexagon   one code region
 *   cluster   the regions of one line of work inside a plan box: the commit
 *             scope that wrote most of each region's lines (feat(scope): ...),
 *             or its file when that commit had no scope
 *   group     a plan box - the regions placed under it - and one more,
 *             "Not yet placed", for the code the plan does not explain yet
 *   shared    a region placed in several boxes (a Venn overlap) sits in its
 *             first box's group, on the border facing the other box, and links
 *             the two clusters
 *
 * Cluster centres settle by a small force simulation, then every cluster grows
 * over the hexagon grid at once, nearest its centre first, keeping a gap
 * between groups. Deterministic: the same map always draws the same way
 * (t-d16fcf04cb).
 */
export const S = 10;
const SQ3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const PAL = ['#2F5BD3', '#C2571A', '#1F7A6E', '#6B4FBB', '#B0447A', '#8A6D00', '#0E7490', '#9F1239'];
export const WAIT = 'Not yet placed';
export const px = (q, r) => [S * SQ3 * (q + r / 2), S * 1.5 * r];
const key = (q, r) => q + ',' + r;
const corners = (x, y) => [...Array(6)].map((_, i) => { const a = Math.PI / 180 * (60 * i - 30); return [x + S * Math.cos(a), y + S * Math.sin(a)]; });
export const scopeOf = (text) => ((/^[a-z]+\(([^),]+)/.exec(String(text || '')) || [])[1] || '').trim();
const base = (f) => String(f).split('/').pop();

/* cv: what /api/code gives - run, places, regions, commits ({sha: [date, text]}). */
export function buildCodeMap(cv) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sections = cv.run.sections;
  const groups = [], gIndex = {};
  const groupFor = (address) => (gIndex[address] ??= (groups.push({ id: groups.length, address, name: address === WAIT ? WAIT : address.split(' > ').pop(),
    wait: address === WAIT, clusters: [] }), groups.length - 1));
  /* Groups in the plan's own order, the waiting group last. */
  const used = new Set(cv.places.flatMap((p) => (p.sections.length ? [p.sections[0]] : [WAIT])));
  for (const s of sections) if (used.has(s)) groupFor(s);
  if (used.has(WAIT)) groupFor(WAIT);
  groups.forEach((g, i) => { g.col = g.wait ? '#8A8E95' : PAL[i % PAL.length]; });

  const commitText = (sha) => { const c = cv.commits[sha]; return Array.isArray(c) ? c[1] : c || ''; };
  const commitDate = (sha) => { const c = cv.commits[sha]; return Array.isArray(c) ? c[0] : ''; };
  const clusters = [], cIndex = {};
  const regions = [];
  let newest = '';
  for (const p of cv.places) {
    const info = cv.regions[p.region] || { file: p.region.split('::')[0], name: p.region.split('::')[1] || '', commits: [] };
    const g = groupFor(p.sections.length ? p.sections[0] : WAIT);
    const lead = info.commits[0];
    const scope = lead ? scopeOf(commitText(lead)) : '';
    const name = scope || base(info.file);
    const k = g + '|' + name;
    const cl = cIndex[k] ??= (clusters.push({ id: clusters.length, group: g, name, scope, members: [], links: {} }), clusters.length - 1);
    const fresh = info.commits.map(commitDate).filter(Boolean).sort().pop() || '';
    if (fresh > newest) newest = fresh;
    const r = { id: p.region, file: info.file, name: info.name, cl, sections: p.sections, near: p.near || [p.best], score: p.score, fresh, also: [] };
    clusters[cl].members.push(r);
    regions.push(r);
  }
  for (const c of clusters) groups[c.group].clusters.push(c.id);
  /* A shared region also serves the biggest cluster of each other box it sits in. */
  const biggest = (g) => groups[g].clusters.slice().sort((a, b) => clusters[b].members.length - clusters[a].members.length)[0];
  for (const r of regions) {
    for (const s of r.sections.slice(1)) {
      const g = gIndex[s];
      if (g == null || !groups[g].clusters.length) continue;
      const o = biggest(g);
      if (o === r.cl || r.also.includes(o)) continue;
      r.also.push(o);
      clusters[r.cl].links[o] = (clusters[r.cl].links[o] || 0) + 1;
      clusters[o].links[r.cl] = (clusters[o].links[r.cl] || 0) + 1;
    }
  }

  /* 1. cluster centres, in hexagon units */
  const cs = clusters, gs = groups.filter((g) => g.clusters.length);
  const rad = (c) => 0.53 * Math.sqrt(c.members.length) + 0.5;
  const total = cs.reduce((t, c) => t + c.members.length, 0) || 1;
  gs.forEach((g, i) => { const a = (i / gs.length) * Math.PI * 2; const gr = 2.2 * Math.sqrt(total) / Math.PI; g.cx = Math.cos(a) * gr; g.cy = Math.sin(a) * gr; });
  for (const c of cs) { const g = groups[c.group]; c.x = g.cx + (rnd() - 0.5) * 4; c.y = g.cy + (rnd() - 0.5) * 4; }
  for (let it = 0; it < 700; it++) {
    const cool = 1 - it / 760, gc = {};
    for (const g of gs) { let sx = 0, sy = 0, n = 0; for (const id of g.clusters) { sx += cs[id].x; sy += cs[id].y; n++; } gc[g.id] = [sx / n, sy / n]; }
    for (const c of cs) { c.fx = -c.x * 0.01; c.fy = -c.y * 0.01; const m = gc[c.group]; c.fx += (m[0] - c.x) * 0.08; c.fy += (m[1] - c.y) * 0.08; }
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const want = rad(a) + rad(b) + (a.group === b.group ? 0.3 : 2.2);
      if (d < want) { const k = (want - d) * 0.5; a.fx -= k * dx / d; a.fy -= k * dy / d; b.fx += k * dx / d; b.fy += k * dy / d; }
      const w = a.links[b.id];
      if (w) { const k = Math.max(0, d - (rad(a) + rad(b))) * Math.min(0.15, 0.03 * Math.sqrt(w)); a.fx += k * dx / d; a.fy += k * dy / d; b.fx -= k * dx / d; b.fy -= k * dy / d; }
    }
    for (const c of cs) { c.x += Math.max(-2, Math.min(2, c.fx)) * cool; c.y += Math.max(-2, Math.min(2, c.fy)) * cool; }
  }
  /* 2. every cluster grows over the grid at once, nearest its centre first; a
     cell touching another group is taken only when nothing else is left */
  const owner = new Map();
  const ctr = (c) => [c.x * S * SQ3, c.y * S * SQ3];
  const toAx = (x, y) => { const q = (SQ3 / 3 * x - y / 3) / S, r = (2 / 3 * y) / S; let rx = Math.round(q), rz = Math.round(r); const ry = Math.round(-q - r);
    const dq = Math.abs(rx - q), dr = Math.abs(rz - r), ds = Math.abs(ry + q + r); if (dq > dr && dq > ds) rx = -ry - rz; else if (dr > ds) rz = -rx - ry; return [rx, rz]; };
  const touchesOtherGroup = (q, r, g) => DIRS.some(([dq, dr]) => { const o = owner.get(key(q + dq, r + dr)); return o != null && cs[o].group !== g; });
  const touchesOtherCluster = (q, r, id) => DIRS.some(([dq, dr]) => { const o = owner.get(key(q + dq, r + dr)); return o != null && o !== id; });
  for (const c of cs) { c.cells = []; c.front = new Map(); }
  const claim = (c, q, r) => {
    owner.set(key(q, r), c.id); c.cells.push([q, r]);
    for (const x of cs) x.front.delete(key(q, r));
    for (const [dq, dr] of DIRS) { const k = key(q + dq, r + dr); if (!owner.has(k)) c.front.set(k, [q + dq, r + dr]); }
  };
  const seedOf = (c) => {
    const [cx, cy] = ctr(c), [q0, r0] = toAx(cx, cy);
    for (let ring = 0; ring < 400; ring++) {
      let best = null, bd = Infinity;
      for (let dq = -ring; dq <= ring; dq++) for (let dr = Math.max(-ring, -dq - ring); dr <= Math.min(ring, -dq + ring); dr++) {
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
        const q = q0 + dq, r = r0 + dr;
        if (owner.has(key(q, r)) || touchesOtherGroup(q, r, c.group) || touchesOtherCluster(q, r, c.id)) continue;
        const [x, y] = px(q, r), d = Math.hypot(x - cx, y - cy);
        if (d < bd) { bd = d; best = [q, r]; }
      }
      if (best) return best;
    }
    return [q0, r0];
  };
  for (const c of cs.slice().sort((a, b) => b.members.length - a.members.length)) { const [q, r] = seedOf(c); claim(c, q, r); }
  let left = cs.reduce((s, c) => s + c.members.length - 1, 0);
  while (left > 0) {
    let c = null, br = Infinity;
    for (const x of cs) { if (x.cells.length >= x.members.length) continue; const ratio = x.cells.length / x.members.length; if (ratio < br) { br = ratio; c = x; } }
    const [cx, cy] = ctr(c);
    let best = null, bd = Infinity, fb = null, fd = Infinity;
    for (const [, [q, r]] of c.front) {
      const [x, y] = px(q, r), d = Math.hypot(x - cx, y - cy);
      if (touchesOtherGroup(q, r, c.group)) { if (d < fd) { fd = d; fb = [q, r]; } continue; }
      if (d < bd) { bd = d; best = [q, r]; }
    }
    const pick = best || fb || seedOf(c);
    claim(c, pick[0], pick[1]); left--;
  }
  /* 3. regions into cells: a shared region takes the cell facing the other
     box; the rest go row by row, file by file */
  for (const c of cs) {
    const free = c.cells.slice();
    const take = (dist) => { let bi = -1, bd = Infinity; free.forEach((cell, i) => { const d = dist(cell); if (d < bd) { bd = d; bi = i; } }); return free.splice(bi, 1)[0]; };
    const shared = c.members.filter((r) => r.also.length).sort((a, b) => b.also.length - a.also.length);
    const rest = c.members.filter((r) => !r.also.length).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    for (const r of shared) {
      const [ox, oy] = ctr(cs[r.also[0]]);
      const cell = take(([q, rr]) => { const [x, y] = px(q, rr); return Math.hypot(x - ox, y - oy); });
      r.q = cell[0]; r.rr = cell[1];
    }
    free.sort((a, b) => { const pa = px(a[0], a[1]), pb = px(b[0], b[1]); return Math.round(pa[1]) - Math.round(pb[1]) || pa[0] - pb[0]; });
    rest.forEach((r, i) => { r.q = free[i][0]; r.rr = free[i][1]; });
  }
  /* Shift so everything sits at positive pixels with room for labels. */
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of regions) { const [x, y] = px(r.q, r.rr); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const R0 = Math.round((70 - minY) / (1.5 * S)), Q0 = Math.round((50 - minX) / (S * SQ3) - R0 / 2);
  for (const r of regions) { r.q += Q0; r.rr += R0; [r.x, r.y] = px(r.q, r.rr); }

  /* Borders as path data: cluster outlines and group outlines. */
  const at = new Map(regions.map((r) => [key(r.q, r.rr), r]));
  const edgeTo = (r, dq, dr) => {
    const [nx, ny] = px(r.q + dq, r.rr + dr);
    const cc = corners(r.x, r.y).map((p) => [p, Math.hypot(p[0] - nx, p[1] - ny)]).sort((a, b) => a[1] - b[1]);
    return 'M' + cc[0][0].map((v) => v.toFixed(1)).join(' ') + 'L' + cc[1][0].map((v) => v.toFixed(1)).join(' ');
  };
  const outline = (members, same) => {
    let d = '';
    for (const r of members) for (const [dq, dr] of DIRS) { const n = at.get(key(r.q + dq, r.rr + dr)); if (!n || !same(n)) d += edgeTo(r, dq, dr); }
    return d;
  };
  const centroid = (ms) => { let sx = 0, sy = 0; for (const r of ms) { sx += r.x; sy += r.y; } return [sx / ms.length, sy / ms.length]; };
  const boxOf = (ms) => { const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }; for (const m of ms) { b.l = Math.min(b.l, m.x - S); b.t = Math.min(b.t, m.y - S); b.r = Math.max(b.r, m.x + S); b.b = Math.max(b.b, m.y + S); } return b; };
  const outC = cs.map((c) => ({ id: c.id, group: c.group, name: c.name, scope: c.scope, size: c.members.length,
    links: Object.entries(c.links).map(([to, n]) => [+to, n]).sort((a, b) => b[1] - a[1]),
    at: centroid(c.members), edge: outline(c.members, (n) => n.cl === c.id), box: boxOf(c.members), files: [...new Set(c.members.map((m) => m.file))] }));
  const outG = groups.filter((g) => g.clusters.length).map((g) => {
    const ms = g.clusters.flatMap((id) => cs[id].members);
    return { id: g.id, name: g.name, address: g.address, wait: g.wait, col: g.col, clusters: g.clusters, size: ms.length,
      at: centroid(ms), edge: outline(ms, (n) => cs[n.cl].group === g.id), box: boxOf(ms) };
  });
  for (const r of regions) r.group = cs[r.cl].group;
  const W = Math.ceil(maxX - minX + 140), H = Math.ceil(maxY - minY + 160);
  return { S, W, H, regions, clusters: outC, groups: outG, at, newest };
}

/* The hexagon path at a point, a little inside its cell so cells show a seam. */
export function hexD(x, y) {
  let d = '';
  for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); d += (k ? 'L' : 'M') + (x + (S - 0.7) * Math.cos(a)).toFixed(1) + ' ' + (y + (S - 0.7) * Math.sin(a)).toFixed(1); }
  return d + 'Z';
}

/* The region under a point in map pixels, from the grid itself. */
export function regionAt(map, x, y) {
  const q = (SQ3 / 3 * x - y / 3) / S, rr = (2 / 3 * y) / S, s = -q - rr;
  let rq = Math.round(q), rz = Math.round(rr); const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rz - rr), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rs - rz; else if (dr > ds) rz = -rq - rs;
  return map.at.get(key(rq, rz)) || null;
}
