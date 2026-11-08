/*
 * Related neighbours on the Main map (t-5d0347338f), with no DOM.
 *
 * The server says which boxes on a canvas are related and why (relations.py);
 * here the boxes in view are grouped and placed: related boxes touch as a
 * cluster, a cluster that grows past CAP is split at its weakest relation so
 * nothing becomes one giant lump (t-3e803d4274), a box whose removal would
 * split its group into two clusters is a bridge and sits between them,
 * touching both, and clusters and boxes related to nothing sit one empty
 * hexagon apart.
 */
import { pack } from './hexmain.js';

/* A box's address as the server writes it: "T (totem) > S (sub-totem) > Box > Inner". */
export function addressOf(reg, id) {
  const parts = [];
  for (let x = id; x && reg[x] && reg[x].kind !== 'canvas' && x !== 'root'; x = reg[x].parent) {
    const n = reg[x];
    parts.unshift(n.name + (n.kind === 'totem' ? ' (totem)' : n.kind === 'sub' ? ' (sub-totem)' : ''));
  }
  return parts.join(' > ');
}

/* The server's answer, indexed: pair -> edge, pair -> apart, box -> its edges. */
export function indexRelations(data) {
  const pair = new Map(), apart = new Map(), of = new Map();
  const k = (a, b) => (a < b ? a + '\n' + b : b + '\n' + a);
  for (const e of data.edges || []) {
    pair.set(k(e.a, e.b), e);
    for (const x of [e.a, e.b]) { if (!of.has(x)) of.set(x, []); of.get(x).push(e); }
  }
  for (const e of data.apart || []) apart.set(k(e.a, e.b), e);
  return { data, edge: (a, b) => pair.get(k(a, b)) || null, apart: (a, b) => apart.get(k(a, b)) || null, of: (a) => of.get(a) || [] };
}

function components(nodes, edges) {
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [a, b] of edges) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  const groups = new Map();
  for (const n of nodes) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }
  return [...groups.values()];
}

/* The boxes in view as clusters, bridges and loners. w(a, b) is the strength
   of the relation between two of them, 0 when none. */
export function groupsOf(ids, w, CAP = 7) {
  const all = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const x = w(ids[i], ids[j]);
    if (x > 0) all.push([ids[i], ids[j], x]);
  }
  /* No giant lumps: cut the weakest relation inside a group past CAP until none is. */
  const edges = all.slice(), cut = [];
  for (;;) {
    const big = components(ids, edges).find((c) => c.length > CAP);
    if (!big) break;
    const inBig = new Set(big);
    let k = -1, low = Infinity;
    edges.forEach((e, i) => { if (inBig.has(e[0]) && inBig.has(e[1]) && e[2] < low) { low = e[2]; k = i; } });
    cut.push(edges.splice(k, 1)[0]);
  }
  const units = components(ids, edges);
  const clusters = [], bridges = {};
  /* A bridge: a box whose removal leaves two or more parts of two boxes or
     more. Of several, the one leaving the most even parts is taken, and each
     part is looked at again - so in a chain of two clusters only the box
     between them is the bridge, not every box along the way. */
  const split = (u) => {
    const ue = edges.filter((e) => u.includes(e[0]) && u.includes(e[1]));
    let best = null, bestMin = 1;
    if (u.length >= 5) for (const v of u) {
      const parts = components(u.filter((x) => x !== v), ue.filter((e) => e[0] !== v && e[1] !== v)).filter((p) => p.length >= 2);
      if (parts.length < 2) continue;
      const m = Math.min(...parts.map((p) => p.length));
      if (m > bestMin) { bestMin = m; best = v; }
    }
    if (!best) { clusters.push(u); return []; }
    const parts = components(u.filter((x) => x !== best), ue.filter((e) => e[0] !== best && e[1] !== best));
    const joins = [];
    for (const p of parts) {
      const before = clusters.length;
      split(p);
      /* The bridge joins the clusters, made from this part, that it touches. */
      for (let i = before; i < clusters.length; i++) if (ue.some((e) => (e[0] === best && clusters[i].includes(e[1])) || (e[1] === best && clusters[i].includes(e[0])))) joins.push(i);
    }
    bridges[best] = joins;
    return joins;
  };
  for (const u of units) split(u);
  const clusterOf = {};
  clusters.forEach((c, i) => c.forEach((id) => { clusterOf[id] = i; }));
  return { units, clusters, clusterOf, bridges, edges, cut };
}

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (c) => c[0] + ',' + c[1];
const ring = (c) => (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[0] + c[1])) / 2;

/* One group laid out: each box beside the boxes it is related to, boxes of
   different clusters never touching, a bridge touching both. */
function placeUnit(u, g) {
  const strength = new Map();
  for (const [a, b, x] of g.edges) { strength.set(a + '\n' + b, x); strength.set(b + '\n' + a, x); }
  const s = (a, b) => strength.get(a + '\n' + b) || 0;
  const label = (id) => (g.bridges[id] ? '*' : g.clusterOf[id]);
  const occ = new Map(), cell = {};
  const clash = (c, id) => DIRS.some((d) => {
    const o = occ.get(key([c[0] + d[0], c[1] + d[1]]));
    return o !== undefined && label(o) !== '*' && label(id) !== '*' && label(o) !== label(id);
  });
  const degree = (id) => u.reduce((t, o) => t + s(id, o), 0);
  const order = [];
  const left = new Set(u);
  /* Start from a bridge if there is one, else the most related box. */
  let first = u.filter((id) => g.bridges[id]).sort((a, b) => degree(b) - degree(a))[0] || u.slice().sort((a, b) => degree(b) - degree(a))[0];
  order.push(first); left.delete(first);
  while (left.size) {
    let best = null, bw = -1;
    for (const id of left) { const t = order.reduce((acc, o) => acc + s(id, o), 0); if (t > bw || (t === bw && degree(id) > degree(best))) { bw = t; best = id; } }
    order.push(best); left.delete(best);
  }
  for (const id of order) {
    if (!Object.keys(cell).length) { cell[id] = [0, 0]; occ.set('0,0', id); continue; }
    const placed = Object.keys(cell);
    const near = placed.filter((o) => s(id, o) > 0);
    const from = near.length ? near : placed.filter((o) => label(o) === label(id) || label(o) === '*');
    const pick = (strict, src) => {
      let best = null, bs = Infinity;
      for (const o of src) for (const d of DIRS) {
        const c = [cell[o][0] + d[0], cell[o][1] + d[1]];
        if (occ.has(key(c)) || (strict && clash(c, id))) continue;
        const touch = DIRS.reduce((t, e) => { const n = occ.get(key([c[0] + e[0], c[1] + e[1]])); return t + (n !== undefined ? s(id, n) : 0); }, 0);
        const sc = -10 * touch + ring(c);
        if (sc < bs) { bs = sc; best = c; }
      }
      return best;
    };
    const c = pick(true, from.length ? from : placed) || pick(true, placed) || pick(false, placed);
    cell[id] = c; occ.set(key(c), id);
  }
  return cell;
}

/* Every box in view placed: groups packed one empty hexagon apart, the
   biggest in the middle. */
export function relationLayout(ids, w, CAP = 7) {
  const g = groupsOf(ids, w, CAP);
  const units = g.units.slice().sort((a, b) => b.length - a.length);
  const cells = pack(units.map((u) => placeUnit(u, g)));
  return { cells, groups: g };
}
