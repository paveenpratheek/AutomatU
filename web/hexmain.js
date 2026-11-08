/*
 * The Main map's model and layout, from the prototype, with no DOM.
 *
 * model(): the bound canvases as one registry - canvas > totem > sub-totem >
 * boxes inside boxes - with the links each totem draws between its boxes.
 * Layout: the canvases side by side; inside a canvas each totem in the middle
 * of its sub-totems, related ones touching and unrelated ones one hexagon
 * apart; inside a totem or box its boxes in a spiral. Coordinates are axial
 * [q, r]; fit() turns them into pixels for the space there is.
 */
export function model(canvases) {
  const reg = { root: { id: 'root', kind: 'root', name: 'Map', parent: null, children: [], subs: [], content: [], text: '' } };
  const blinks = [], items = [];
  let n = 0, palN = 0;
  const mk = (kind, name, parent, totem, canvas) => {
    const id = kind.charAt(0) + (n++);
    reg[id] = { id, kind, name, parent, totem, canvas, children: [], subs: [], content: [], text: '' };
    return id;
  };
  const putItems = (owner, list) => {
    for (const it of list || []) {
      const x = { ...it, box: owner, totem: reg[owner].totem };
      reg[owner].content.push(x); items.push(x);
    }
  };
  const box = (b, owner, totem, canvas) => {
    const id = mk('box', b.name, owner, totem, canvas);
    reg[owner].children.push(id);
    putItems(id, b.items);
    for (const k of b.boxes || []) box(k, id, totem, canvas);
  };
  const chain = (id) => { const out = []; let x = id; while (x && x !== 'root') { out.push(reg[x].name); x = reg[x].parent; } return out; };
  const strip = (s) => s.replace(/\s*\((totem|sub-totem|note)\)\s*$/, '').trim();
  const resolve = (str, totem) => {
    const segs = String(str).split('>').map(strip);
    const last = segs.pop();
    let c = items.filter((it) => it.totem === totem && it.type === 'note' && it.name === last);
    if (segs.length) c = c.filter((it) => { const names = chain(it.box); return segs.every((s) => names.includes(s)); });
    if (c.length) return { box: c[0].box, name: last };
    let b = Object.keys(reg).filter((k) => reg[k].totem === totem && reg[k].kind === 'box' && reg[k].name === last);
    if (segs.length > 1) b = b.filter((k) => { const names = chain(k); return segs.every((s) => names.includes(s)); });
    return b.length ? { box: b[0], name: last } : null;
  };
  for (const cv of canvases) {
    const cid = mk('canvas', cv.name, 'root', null, null);
    Object.assign(reg[cid], { canvas: cid, agent: !!cv.agent, repos: cv.repos || [] });
    reg.root.children.push(cid);
    for (const t of cv.totems) {
      const tid = mk('totem', t.name, cid, null, cid);
      Object.assign(reg[tid], { totem: tid, pal: palN++, owner: t.owner || '', text: t.text || '',
        plans: (cv.repos || []).filter((r) => r.totem === t.name).map((r) => r.name) });
      reg[cid].children.push(tid);
      putItems(tid, t.items);
      for (const b of t.boxes) box(b, tid, tid, cid);
      for (const s of t.subs || []) {
        const sid = mk('sub', s.name, tid, tid, cid);
        reg[sid].text = s.text || '';
        reg[tid].subs.push(sid);
        putItems(sid, s.items);
        for (const b of s.boxes) box(b, sid, tid, cid);
      }
      for (const [from, to] of t.links || []) {
        const a = resolve(from, tid), b = resolve(to, tid);
        if (a && b && a.box !== b.box) blinks.push({ a: a.box, b: b.box, an: a.name, bn: b.name });
      }
    }
  }
  return { reg, blinks, items };
}

export const under = (reg, id, x) => { let n = id; while (n && n !== 'root') { if (n === x) return true; n = reg[n].parent; } return x === 'root'; };
export const pathTo = (reg, id) => { const out = []; let n = id; while (n) { out.unshift(n); n = n === 'root' ? null : reg[n].parent; } return out; };
export const boxesUnder = (reg, id) => { let out = []; const x = reg[id]; for (const c of x.children.concat(x.subs)) { out.push(c); out = out.concat(boxesUnder(reg, c)); } return out; };

export const hd = (a, b) => { const dq = a[0] - b[0], dr = a[1] - b[1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
export const px = (c) => [0.75 * c[0], 0.8660254 * (c[1] + c[0] / 2)];

/* A totem in the centre, its sub-totems around it: related ones touch,
   unrelated ones keep one hexagon of space. */
export function placeAround(ids, related) {
  const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  const occ = { '0,0': '__c' }, cellOf = {}, key = (c) => c[0] + ',' + c[1];
  const comp = {}, comps = [];
  for (const id of ids) {
    if (comp[id] !== undefined) continue;
    const ci = comps.length, members = [], queue = [id];
    comp[id] = ci;
    while (queue.length) {
      const x = queue.shift(); members.push(x);
      for (const y of ids) if (comp[y] === undefined && related(x, y)) { comp[y] = ci; queue.push(y); }
    }
    comps.push(members);
  }
  const order = comps.map((m, i) => i).sort((a, b) => comps[b].length - comps[a].length || a - b);
  const k = comps.length, quota = Math.max(1, Math.floor((6 - k) / Math.max(k, 1))), ring1 = {};
  const free = (c) => occ[key(c)] === undefined;
  const touchesOther = (c, ci) => DIRS.some((d) => { const o = occ[key([c[0] + d[0], c[1] + d[1]])]; return o !== undefined && o !== '__c' && comp[o] !== ci; });
  const put = (id, c) => { occ[key(c)] = id; cellOf[id] = c; if (hd(c, [0, 0]) === 1) ring1[comp[id]] = (ring1[comp[id]] || 0) + 1; };
  const ALL = [];
  for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) ALL.push([q, r]);
  const starts = [];
  for (const ci of order) {
    let best = null, bs = Infinity;
    for (const c of ALL) {
      if (!free(c) || touchesOther(c, ci)) continue;
      const ring = hd(c, [0, 0]);
      if (ring < 1) continue;
      const p = px(c);
      let far = 0;
      if (starts.length) { far = Infinity; for (const sc of starts) { const ps = px(sc); far = Math.min(far, Math.hypot(p[0] - ps[0], p[1] - ps[1])); } }
      const s = ring * 1000 - far;
      if (s < bs) { bs = s; best = c; }
    }
    put(comps[ci][0], best); starts.push(best);
  }
  for (const ci of order) {
    for (const id of comps[ci].slice(1)) {
      let anchors = comps[ci].filter((o) => cellOf[o] && related(o, id));
      if (!anchors.length) anchors = comps[ci].filter((o) => cellOf[o]);
      const pick = (strict, useQuota) => {
        let best = null, bs = Infinity;
        for (const a of anchors) for (const d of DIRS) {
          const c = [cellOf[a][0] + d[0], cellOf[a][1] + d[1]];
          if (!free(c)) continue;
          if (strict && touchesOther(c, ci)) continue;
          const ring = hd(c, [0, 0]);
          if (useQuota && ring === 1 && (ring1[ci] || 0) >= quota) continue;
          const s = ring * 10 + (ring === 1 ? -5 : 0);
          if (s < bs) { bs = s; best = c; }
        }
        return best;
      };
      let c = pick(true, true) || pick(true, false) || pick(false, false);
      if (!c) { let bs = Infinity; for (const x of ALL) if (free(x) && hd(x, [0, 0]) < bs) { bs = hd(x, [0, 0]); c = x; } }
      put(id, c);
    }
  }
  return cellOf;
}

/* Clusters side by side, each new one one hexagon away from what is placed. */
export function pack(clusters) {
  const cells = {}, all = [];
  for (const local of clusters) {
    const ids = Object.keys(local);
    let off = [0, 0];
    if (all.length) {
      let best = null, bs = Infinity, cx = 0, cy = 0;
      for (const c of all) { const p = px(c); cx += p[0]; cy += p[1]; }
      cx /= all.length; cy /= all.length;
      for (let dq = -16; dq <= 16; dq++) for (let dr = -16; dr <= 16; dr++) {
        let md = Infinity;
        for (const id of ids) { const c = [local[id][0] + dq, local[id][1] + dr]; for (const o of all) md = Math.min(md, hd(c, o)); }
        if (md !== 2) continue;
        let mx = 0, my = 0;
        for (const id of ids) { const p = px([local[id][0] + dq, local[id][1] + dr]); mx += p[0]; my += p[1]; }
        mx /= ids.length; my /= ids.length;
        const s = Math.abs(mx - cx) + Math.abs(my - cy) * 1.6;
        if (s < bs) { bs = s; best = [dq, dr]; }
      }
      off = best || [0, 0];
    }
    for (const id of ids) { const c = [local[id][0] + off[0], local[id][1] + off[1]]; cells[id] = c; all.push(c); }
  }
  return cells;
}

export function related(m, a, b) {
  return m.blinks.some((l) => (under(m.reg, l.a, a) && under(m.reg, l.b, b)) || (under(m.reg, l.a, b) && under(m.reg, l.b, a)));
}

export function canvasLayout(m, cid) {
  const clusters = m.reg[cid].children.map((t) => { const local = placeAround(m.reg[t].subs, (a, b) => related(m, a, b)); local[t] = [0, 0]; return local; });
  return pack(clusters);
}

export const rootLayout = (m) => pack(m.reg.root.children.map((c) => ({ [c]: [0, 0] })));

/* Ring by ring around the centre: each ring starts straight up at [0, -k] and
   walks its six sides. (The prototype started each side one turn early, which
   left gaps; every cell of ring k is now k steps from the centre - t-6f7dcc4972.) */
export function spiral(n) {
  const out = [[0, 0]], DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  for (let ring = 1; out.length < n; ring++) {
    let c = [0, -ring];
    for (let s = 0; s < 6; s++) for (let j = 0; j < ring; j++) { if (out.length < n) out.push(c.slice()); c = [c[0] + DIRS[s][0], c[1] + DIRS[s][1]]; }
  }
  return out.slice(0, n);
}

/* Pixel placement of cells in an area w x h, below a strip `top` high. */
export function fit(cellList, maxW, top, w, h) {
  if (!cellList.length) cellList = [[0, 0]];
  const xs = [], ys = [];
  for (const c of cellList) { const p = px(c); xs.push(p[0]); ys.push(p[1]); }
  const minX = Math.min(...xs) - 0.5, maxX = Math.max(...xs) + 0.5;
  const minY = Math.min(...ys) - 0.433, maxY = Math.max(...ys) + 0.433;
  const availW = w - 80, availH = h - 38 - top;
  const W = Math.min(maxW, availW / (maxX - minX), availH / (maxY - minY));
  const cx = w / 2, cy = top + availH / 2;
  const ox = cx - W * (minX + maxX) / 2, oy = cy - W * (minY + maxY) / 2;
  return { W, H: W * 0.8660254, at: (c) => { const p = px(c); return [ox + W * p[0], oy + W * p[1]]; } };
}

export const hexPts = (w, h) => [[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

/* The faint hexagons around what is shown, fading with distance. */
export function ghostRing(cellList, F, maxD, w, h) {
  const out = [], ALPHA = { 1: 0.22, 2: 0.12, 3: 0.05 }, seen = {};
  if (!cellList.length) return out;
  for (const c of cellList) seen[c[0] + ',' + c[1]] = 1;
  const qs = cellList.map((c) => c[0]), rs = cellList.map((c) => c[1]);
  for (let q = Math.min(...qs) - 6; q <= Math.max(...qs) + 6; q++) {
    for (let r = Math.min(...rs) - 6; r <= Math.max(...rs) + 6; r++) {
      if (seen[q + ',' + r]) continue;
      let d = Infinity;
      for (const c of cellList) d = Math.min(d, hd([q, r], c));
      if (d > maxD) continue;
      const p = F.at([q, r]);
      if (p[0] < -F.W || p[0] > w + F.W || p[1] < -F.H || p[1] > h + F.H) continue;
      out.push({ l: p[0] - F.W / 2, t: p[1] - F.H / 2, w: F.W, h: F.H, line: 'rgba(27, 29, 33, ' + ALPHA[d] + ')' });
    }
  }
  return out;
}
