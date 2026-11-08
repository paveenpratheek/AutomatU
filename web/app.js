/*
 * The AutomatU map view, with the SearchX prototype's look and layout
 * (t-87c7947c95), rebuilt as plain modules (t-9df524dad9).
 *
 * Main: the canvases bound to a repository as hexagons - click in from canvas
 * to totem to sub-totem to box; a box with content opens in the panel.
 * Code: a repository's newest map - each plan box a cluster, its placed code
 * as hexagons, a region in several boxes where their clusters meet; boxes no
 * code reaches and code not yet placed are listed in the panel.
 * Traffic: keywords split by ";" light up the hexagons holding them on both.
 */
import { model, pathTo, boxesUnder, under, canvasLayout, rootLayout, spiral, fit, hexPts, ghostRing } from './hexmain.js';
import { keywords, hitsOf, shownAndOn, dominant, traffic, regionHits, zeros } from './search.js';
import { buildCodeMap, hexD, regionAt } from './codelayout.js';
import { boardHtml, routeWires, wiresHtml, worldRect } from './board.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (address) => String(address).split(' > ').pop();

const CANVAS = { ring: 'rgba(27, 29, 33, 0.38)', strong: '#D8D3C6', fill: '#E9E5DA', soft: '#F6F4EE', ink: '#1B1D21', swatch: '#8A8576', glow: 'rgba(233, 229, 218, 0.95)' };
const PALS = [
  { ring: 'rgba(176, 68, 122, 0.55)', strong: '#EBC4D7', fill: '#F5DCE8', soft: '#FBF0F5', ink: '#7D2353', swatch: '#B0447A', glow: 'rgba(245, 220, 232, 0.9)' },
  { ring: 'rgba(47, 91, 211, 0.55)', strong: '#C5D5F6', fill: '#DCE6FA', soft: '#F1F5FD', ink: '#1D3E8A', swatch: '#2F5BD3', glow: 'rgba(220, 230, 250, 0.9)' },
  { ring: 'rgba(194, 87, 26, 0.55)', strong: '#F1C9AC', fill: '#F8E0CF', soft: '#FDF4ED', ink: '#7A3410', swatch: '#C2571A', glow: 'rgba(248, 224, 207, 0.9)' },
  { ring: 'rgba(31, 122, 110, 0.55)', strong: '#B6E0D6', fill: '#D5EEE8', soft: '#EEF8F5', ink: '#165A50', swatch: '#1F7A6E', glow: 'rgba(213, 238, 232, 0.9)' },
  { ring: 'rgba(107, 79, 187, 0.55)', strong: '#D2C7F1', fill: '#E4DDF7', soft: '#F4F1FC', ink: '#432C8C', swatch: '#6B4FBB', glow: 'rgba(228, 221, 247, 0.9)' },
];
/* Plan boxes on the code map: more of them than totems, so a longer list. */
const BOXCOLS = ['#B0447A', '#2F5BD3', '#C2571A', '#1F7A6E', '#6B4FBB', '#9A6A00', '#0F7C91', '#7A8B1C', '#A33A3A', '#46617D', '#D6336C', '#2B8A3E'];
const CHIPS = ['canvas', 'alignment', 'GitX', 'calibration'];
const HEX = 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)';

const rgbOf = (h) => { h = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const tint = (hex, k) => 'rgb(' + rgbOf(hex).map((v) => Math.round(255 + (v - 255) * k)).join(', ') + ')';
const grad = (inner, outer) => `radial-gradient(circle at 50% 42%, ${inner} 0%, ${outer} 82%)`;

/* ------------------------------------------------------------ state */

export const S = {
  tab: 'main', path: ['root'], sel: null, query: '', off: {}, dir: 1, tick: 0, ox: 0, oy: 0,
  m: null, failed: '', layouts: {}, memo: {},
  repos: [], repo: null, code: {}, codeFailed: '', cg: null, cc: null, cview: null, fresh: new Set(),
};

function stageSize() { const r = $('stage').getBoundingClientRect(); return { w: Math.max(320, r.width), h: Math.max(320, r.height) }; }

/* The search as it stands: keywords, which are shown and on, the terms on. */
function search() {
  const kw = keywords(S.query);
  const global = zeros(kw);
  if (S.m && kw.length) {
    for (const id of Object.keys(S.m.reg)) {
      if (id === 'root') continue;
      const x = S.m.reg[id];
      hitsOf(kw, x.name).forEach((v, i) => { global[i] += 2 * v; });
      for (const it of x.content) hitsOf(kw, it.name + ' ' + it.text).forEach((v, i) => { global[i] += v; });
    }
  }
  const cv = S.code[S.repo];
  if (cv && kw.length) codeHits(cv, kw).forEach((per) => per.forEach((v, i) => { if (v) global[i]++; }));
  const on = shownAndOn(kw, global, S.off);
  return { kw, on, global, terms: kw.filter((k, i) => on[i].on).map((k) => k.key) };
}

/* ------------------------------------------------------------ main map */

const palOf = (reg, id) => { const x = reg[id]; if (!x || x.kind === 'root' || x.kind === 'canvas') return CANVAS; return PALS[(reg[x.totem].pal || 0) % PALS.length]; };
const isLeaf = (reg, id) => reg[id].kind === 'box' && reg[id].children.length === 0;
function countOf(reg, id) {
  const c = reg[id].content, parts = [];
  const nn = c.filter((x) => x.type === 'note').length, tt = c.filter((x) => x.type === 'text').length, ff = c.filter((x) => x.type === 'file').length;
  if (tt) parts.push(tt + (tt === 1 ? ' text' : ' texts'));
  if (nn) parts.push(nn + (nn === 1 ? ' note' : ' notes'));
  if (ff) parts.push(ff + (ff === 1 ? ' file' : ' files'));
  return parts.join(' · ') || 'empty';
}

function renderMain() {
  const stage = $('stage'), { w, h } = stageSize();
  if (!S.m) {
    stage.innerHTML = `<div class="status">${esc(S.failed || 'Loading the canvases…')}</div>`;
    $('panel').innerHTML = '';
    return;
  }
  const reg = S.m.reg, Q = search();
  const view = reg[S.path[S.path.length - 1]] ? S.path[S.path.length - 1] : 'root', node = reg[view];
  const memoKey = S.query + '|' + JSON.stringify(S.off);
  if (S.memo.key !== memoKey) S.memo = { key: memoKey };
  const heatArr = (id) => {
    if (!S.memo[id]) {
      let a = zeros(Q.kw);
      for (const b of [id].concat(boxesUnder(reg, id))) {
        if (b === 'root') continue;
        hitsOf(Q.kw, reg[b].name).forEach((v, i) => { a[i] += 2 * v; });
        for (const it of reg[b].content) hitsOf(Q.kw, it.name + ' ' + it.text).forEach((v, i) => { a[i] += v; });
      }
      S.memo[id] = a;
    }
    return S.memo[id];
  };
  const heat = (id) => (Q.terms.length ? traffic(Q.on, heatArr(id)) : 0);

  const cells = [];
  let cellList = [], F, ids = [];
  const cellFor = (id, at, W, H, o) => {
    const x = reg[id], p = palOf(reg, id), hh = heat(id), sel = S.sel === id;
    const nm = x.name, lenDiv = nm.length > 26 ? 11 : (nm.length > 14 ? 9 : 7);
    const fs = Math.max(10, Math.min(o.maxFs, W / lenDiv));
    const fill = o.kind === 'canvas' ? grad(p.soft, p.strong) : o.kind === 'totem' ? grad(p.fill, p.strong) : o.leaf ? grad('#FFFFFF', p.soft) : grad(p.soft, p.fill);
    return { id, l: at[0] - W / 2, t: at[1] - H / 2, w: W, h: H, fs, subFs: Math.max(9, Math.min(12, fs - 3)), weight: o.kind === 'totem' || o.kind === 'canvas' ? 700 : 600,
      title: nm, sub: o.sub, line: sel ? '#141413' : p.ring, inset: sel ? 2 : 1, fill, ink: p.ink, op: 1, hits: hh, arr: hh ? heatArr(id) : null, sel, pf: p.fill,
      kws: [], heat: '', act: o.leaf ? 'read' : 'open', aria: (o.leaf ? 'Read ' : 'Open ') + nm, at };
  };
  if (view === 'root') {
    const L = S.layouts.root || (S.layouts.root = rootLayout(S.m));
    ids = Object.keys(L); cellList = ids.map((id) => L[id]);
    F = fit(cellList, 220, 20, w, h);
    for (const id of ids) {
      const x = reg[id];
      cells.push(cellFor(id, F.at(L[id]), F.W, F.H, { kind: 'canvas', maxFs: 22,
        sub: (x.agent ? 'agent canvas · ' : 'canvas · ') + x.children.length + ' totems' }));
    }
  } else if (node.kind === 'canvas') {
    const L = S.layouts[view] || (S.layouts[view] = canvasLayout(S.m, view));
    ids = Object.keys(L); cellList = ids.map((id) => L[id]);
    F = fit(cellList, 170, 80, w, h);
    for (const id of ids) {
      const x = reg[id];
      cells.push(cellFor(id, F.at(L[id]), F.W, F.H, { kind: x.kind, maxFs: x.kind === 'totem' ? 16 : 15,
        sub: x.kind === 'totem' ? 'totem · ' + x.children.length + ' boxes' : x.children.length + ' boxes' }));
    }
  } else {
    const kids = node.children, coords = spiral(Math.max(kids.length, 1));
    cellList = kids.length ? coords : [];
    F = fit(coords, 210, 80, w, h);
    kids.forEach((id, i) => {
      const leaf = isLeaf(reg, id);
      cells.push(cellFor(id, F.at(coords[i]), F.W, F.H, { kind: 'box', leaf, maxFs: 17,
        sub: leaf ? countOf(reg, id) : reg[id].children.length + ' boxes inside' }));
    });
  }
  /* Traffic, graded among the hexagons in view: the busiest fully lit, the
     others by their share of it, and a hexagon with none steps back. */
  if (Q.terms.length) {
    const maxH = Math.max(0, ...cells.map((c) => c.hits));
    for (const c of cells) {
      if (!c.hits) { c.op = 0.4; continue; }
      const k = c.hits / maxH, col = Q.kw[dominant(Q.kw, Q.on, c.arr)].col;
      if (!c.sel) c.line = 'rgba(' + rgbOf(col).join(', ') + ', ' + (0.35 + 0.6 * k).toFixed(2) + ')';
      c.inset = 1 + Math.round(3 * k);
      c.fill = grad(tint(col, 0.1 + 0.5 * k), c.pf);
      c.kws = Q.kw.map((kk, i) => ({ col: kk.col, n: c.arr[i], on: Q.on[i].on })).filter((o) => o.on && o.n > 0);
      c.heat = c.hits === maxH && cells.length > 1 ? 'most' : '';
    }
  }
  const ghosts = ghostRing(cellList, F, 2, w, h), pts = hexPts(F.W, F.H);
  const focused = view !== 'root', bp = palOf(reg, view);
  const BW = Math.min(w * 0.78, (h - 90) / 0.8660254), BH = BW * 0.8660254;
  const anim = (S.dir > 0 ? 'enter' : 'back') + (S.tick % 2 ? 'A' : 'B');

  stage.innerHTML =
    `<div class="world ${S.tick ? anim : ''}" style="transform-origin: ${S.ox || w / 2}px ${S.oy || h / 2}px">` +
    (focused ? `<div class="hexclip" aria-hidden="true" style="position:absolute;left:${w / 2 - BW / 2}px;top:${80 + (h - 90 - BH) / 2}px;width:${BW}px;height:${BH}px;background:radial-gradient(closest-side, ${bp.glow} 0%, rgba(244, 242, 236, 0) 100%)"></div>` +
      `<svg class="ghost" aria-hidden="true" width="${BW}" height="${BH}" style="left:${w / 2 - BW / 2}px;top:${80 + (h - 90 - BH) / 2}px"><polygon points="${hexPts(BW, BH)}" fill="none" stroke="${bp.ring.replace(/0\.\d+\)$/, '0.16)')}"></polygon></svg>` : '') +
    ghosts.map((g) => `<svg class="ghost" aria-hidden="true" width="${g.w}" height="${g.h}" style="left:${g.l}px;top:${g.t}px"><polygon points="${pts}" fill="none" stroke="${g.line}"></polygon></svg>`).join('') +
    cells.map((c) => `<div class="cell hexclip" style="left:${c.l}px;top:${c.t}px;width:${c.w}px;height:${c.h}px;opacity:${c.op};background:${c.line}">` +
      `<button type="button" class="hx hexclip" data-act="${c.act}" data-id="${c.id}" data-x="${c.at[0]}" data-y="${c.at[1]}" aria-label="${esc(c.aria)}" style="inset:${c.inset}px;background:${c.fill};color:${c.ink}">` +
      `<span class="t" style="font-size:${c.fs}px;font-weight:${c.weight}">${esc(c.title)}</span><span class="s" style="font-size:${c.subFs}px">${esc(c.sub)}</span>` +
      (c.kws.length ? `<span class="heat">${c.kws.map((k) => `<i><b style="background:${k.col}"></b>${k.n}</i>`).join('')}${c.heat ? `<span>${c.heat}</span>` : ''}</span>` : '') +
      `</button></div>`).join('') +
    `</div>` +
    `<svg class="grain" aria-hidden="true" width="100%" height="100%"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"></feTurbulence><feColorMatrix type="saturate" values="0"></feColorMatrix></filter><rect width="100%" height="100%" filter="url(#grain)"></rect></svg>` +
    (focused ? `<div class="title"><div class="n" style="color:${bp.ink}">${esc(node.name)}</div><div class="kd">${esc(viewKind(reg, node))}</div></div>` : '') +
    `<div class="legend">` + [['#CFC9BA', 'Canvas'], ['#9AA6C8', 'Totem'], ['#D4DCEF', 'Sub-totem or box: open'], ['#FFFFFF', 'Box with content: read'], ['#E39B0B', 'Traffic']]
      .map(([c, t]) => `<span><span class="sw hexclip" style="background:${c}"></span>${t}</span>`).join('') + `</div>`;

  renderMainPanel(reg, view, node, ids.length ? ids : node.children, Q, heat, heatArr);
}

function viewKind(reg, node) {
  if (node.kind === 'canvas') return node.agent ? 'Agent canvas' : 'Canvas';
  if (node.kind === 'totem') return 'Totem: its own boxes';
  if (node.kind === 'sub') return 'Sub-totem of ' + reg[node.totem].name;
  return 'Box in ' + pathTo(reg, node.parent).slice(1).map((k) => reg[k].name).join(' › ');
}

function contentHtml(c) {
  return `<div class="item"><div class="hd"><span class="lb">${esc(c.label)}</span><span class="nm">${esc(c.name)}</span>${c.edited ? '<span class="ed">edited by you</span>' : ''}</div>` +
    (c.text ? `<div class="tx">${esc(c.text)}</div>` : '') + `</div>`;
}

function renderMainPanel(reg, view, node, rowIds, Q, heat, heatArr) {
  const P = $('panel'), m = S.m;
  if (S.sel && reg[S.sel]) {
    const it = reg[S.sel], p = palOf(reg, S.sel);
    const links = m.blinks.filter((l) => l.a === S.sel || l.b === S.sel).map((l) => (l.a === S.sel ? { dir: 'to', other: l.b, title: l.bn } : { dir: 'from', other: l.a, title: l.an }));
    P.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="chip" style="background:${p.fill};color:${p.ink}">Box</span><span class="where">in ${esc(pathTo(reg, it.parent).slice(1).map((k) => reg[k].name).join(' › '))}</span></div>` +
      `<h2 style="margin:10px 0 16px">${esc(it.name)}</h2>` + it.content.map(contentHtml).join('') +
      (links.length ? `<h3>Linked on the canvas</h3><div class="rows">` + links.map((l) => `<button type="button" class="row" data-act="read" data-id="${l.other}"><span class="mt">${l.dir}</span><span class="nm">${esc(l.title)}</span></button>`).join('') + `</div>` : '');
    return;
  }
  const countKind = (k, u) => (u ? boxesUnder(reg, u) : Object.keys(reg)).filter((x) => reg[x].kind === k).length;
  let stats, kind, title = node.name, owner = '';
  if (view === 'root') {
    kind = 'Map'; title = 'Your canvases';
    stats = [[reg.root.children.length, 'canvases'], [countKind('totem'), 'totems'], [m.items.length, 'notes, texts, files']];
  } else if (node.kind === 'canvas') {
    kind = node.agent ? 'Agent canvas' : 'Canvas';
    stats = [[node.children.length, 'totems'], [countKind('sub', view), 'sub-totems'], [countKind('box', view), 'boxes']];
    owner = node.agent ? 'An agent canvas: drawn from one script per totem.' : 'Your own canvas in File Fabric; agents wrote some of its totems.';
    if (node.repos.length) owner += ' Plans ' + node.repos.map((r) => r.name + (r.totem ? ' (totem ' + r.totem + ')' : '')).join(', ') + '.';
  } else {
    kind = node.kind === 'totem' ? 'Totem' : node.kind === 'sub' ? 'Sub-totem' : 'Box';
    const under_ = boxesUnder(reg, view);
    stats = [[under_.filter((x) => reg[x].kind === 'box').length, 'boxes inside'], [[view].concat(under_).reduce((s, b) => s + reg[b].content.length, 0), 'notes, texts, files'],
      [m.blinks.filter((l) => under(reg, l.a, view) || under(reg, l.b, view)).length, 'links']];
    if (node.kind === 'totem' && node.owner) owner = 'Written by ' + node.owner + (node.owner === 'user' ? '' : ', an agent');
    if (node.kind === 'totem' && node.plans && node.plans.length) owner += (owner ? '. ' : '') + 'The plan of ' + node.plans.join(', ') + ': its code is placed under these boxes.';
  }
  let traffic = '';
  if (Q.terms.length && rowIds.length) {
    const rows = rowIds.map((id) => { const i = dominant(Q.kw, Q.on, heatArr(id)); return { name: reg[id].name, n: heat(id), col: i >= 0 ? Q.kw[i].col : '#E39B0B' }; }).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...rows.map((r) => r.n));
    traffic = `<h3>Traffic</h3><p>${esc(groupText(Q))}</p><div class="bars">` +
      rows.map((r) => `<div class="bar"><span class="nm">${esc(r.name)}</span><span class="tr"><i style="width:${Math.round(r.n / max * 100)}%;background:${r.col}"></i></span><span class="n">${r.n}</span></div>`).join('') + `</div>`;
  }
  const own = view !== 'root' && node.content.length ? `<h3>On this ${node.kind === 'box' ? 'box' : node.kind}</h3>` + node.content.map(contentHtml).join('') : '';
  const rows = rowIds.map((id) => {
    const x = reg[id], leaf = isLeaf(reg, id);
    const meta = x.kind === 'canvas' ? (x.agent ? 'agent canvas' : 'canvas') : x.kind === 'totem' ? 'totem' : x.kind === 'sub' ? 'sub-totem' : (leaf ? countOf(reg, id) : x.children.length + ' boxes');
    return `<button type="button" class="row" data-act="${leaf ? 'read' : 'open'}" data-id="${id}"><span class="sw hexclip" style="background:${palOf(reg, id).swatch}"></span><span class="nm">${esc(x.name)}</span><span class="mt">${esc(meta)}</span></button>`;
  }).join('');
  P.innerHTML = `<div class="k">${esc(kind)}</div><h2>${esc(title)}</h2>` +
    (owner ? `<p class="owner">${esc(owner)}</p>` : '') +
    (view === 'root' ? '<p>Each canvas bound to a repository is a hexagon. Inside, each totem sits with its sub-totems around it: related ones touch, unrelated ones keep one hexagon of space, and different topics sit one hexagon apart.</p>' : (node.text ? `<p>${esc(node.text)}</p>` : '')) +
    `<div class="stats">${stats.map(([n, l]) => `<div><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>` +
    traffic + own + (rows ? `<h3>Inside</h3><div class="rows">${rows}</div>` : '');
}

function groupText(Q) {
  const on = Q.kw.filter((k, i) => Q.on[i].on);
  return 'Hits of ' + on.map((k) => '"' + k.key + '"').join(', ') + ' in every name, note and text inside each, a name counting twice. A hexagon takes the colour of its most specific keyword, then its busiest.';
}

/* ------------------------------------------------------------ code map */

const commitText = (cv, sha) => { const c = cv.commits[sha]; return Array.isArray(c) ? c[1] : c || ''; };

/* Each region's traffic per keyword, from its code, its plan boxes' words, its
   commits and its decisions. */
function codeHits(cv, kw) {
  if (cv._kwKey === S.query) return cv._hits;
  const out = new Map();
  for (const p of cv.places) {
    const r = cv.regions[p.region];
    if (!r) continue;
    const boxes = p.sections.map((s) => short(s) + ' ' + (cv.words[s] || '')).join(' ');
    out.set(p.region, regionHits(kw, { code: r.name + ' ' + r.file, box: boxes,
      commits: r.commits.map((c) => commitText(cv, c)), thoughts: r.thoughts.map((t) => cv.thoughts[t] || '') }));
  }
  cv._kwKey = S.query; cv._hits = out;
  return out;
}

const mapOf = (cv) => cv._map || (cv._map = buildCodeMap(cv));

/* Level of detail by zoom: plan boxes only, then their clusters too. */
const lodOf = (z) => (z < 0.6 ? 'g' : 'c');

function fitView(map) {
  const { w, h } = stageSize(), top = 64, bottom = 64;
  const z = Math.min(2.2, (w - 48) / map.W, (h - top - bottom) / map.H);
  return { z, tx: (w - map.W * z) / 2, ty: top + (h - top - bottom - map.H * z) / 2 };
}

function renderCode() {
  const stage = $('stage');
  if (!S.repos.length) { stage.innerHTML = `<div class="status">${esc(S.codeFailed || 'No map made yet. Bind a repository to its canvas: automatu bind <repo> <canvas> --totem <plan totem>')}</div>`; $('panel').innerHTML = ''; return; }
  const cv = S.code[S.repo];
  const chips = S.repos.map((r) => `<button type="button" class="repochip${r.repo === S.repo ? ' on' : ''}" data-repo="${esc(r.repo)}">${esc(r.repo.split('/').pop())}</button>`).join('');
  if (!cv) { stage.innerHTML = `<div class="status">${esc(S.codeFailed || 'Reading the code map…')}</div><div class="repochips">${chips}</div>`; $('panel').innerHTML = ''; return; }
  const map = mapOf(cv), Q = search();
  if (!S.cview || S.cview.repo !== S.repo) S.cview = { repo: S.repo, ...fitView(map) };
  const V = S.cview, lod = lodOf(V.z);

  /* Fills: by plan box, fainter for older code and for code not yet placed. */
  const fills = {}, days = (d) => (map.newest && d ? (Date.parse(map.newest) - Date.parse(d)) / 864e5 : 0);
  let dots = '';
  for (const r of map.regions) {
    const g = map.groups.find((x) => x.id === r.group), age = days(r.fresh), b = age <= 7 ? 0 : age <= 21 ? 1 : 2;
    const k = g.id + '|' + b;
    (fills[k] = fills[k] || { col: g.col, op: (g.wait ? 0.45 : 0.9) * [1, 0.72, 0.5][b], d: [] }).d.push(hexD(r.x, r.y));
    if (r.also.length) dots += 'M' + (r.x - 2.6).toFixed(1) + ' ' + r.y.toFixed(1) + 'a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0';
  }
  let svg = Object.values(fills).map((f) => `<path d="${f.d.join('')}" fill="${f.col}" fill-opacity="${f.op.toFixed(2)}"/>`).join('');
  svg += `<path d="${map.clusters.map((c) => c.edge).join('')}" fill="none" stroke="#FBFAF7" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  if (dots) svg += `<path d="${dots}" fill="#FFFFFF" stroke="#5B5F66" stroke-width="0.6"/>`;
  svg += `<path d="${map.groups.map((g) => g.edge).join('')}" fill="none" stroke="#141413" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;

  /* Traffic: the rest steps back; each lit region takes its strongest
     keyword's colour at one of five strengths (log scale). */
  const hits = Q.terms.length ? codeHits(cv, Q.kw) : null, lit = new Map();
  let max = 0;
  if (hits) for (const [rid, per] of hits) { const s = traffic(Q.on, per); if (s) { lit.set(rid, { s, dom: dominant(Q.kw, Q.on, per) }); max = Math.max(max, s); } }
  const groupHeat = {}, clusterHeat = {};
  if (lit.size) {
    svg += `<path d="M-40 -40H${map.W + 40}V${map.H + 40}H-40Z" fill="#F4F2EC" fill-opacity="0.68"/>`;
    const LV = [0.3, 0.48, 0.66, 0.82, 0.96], bk = {};
    for (const r of map.regions) {
      const t = lit.get(r.id);
      if (!t) continue;
      const l = Math.max(0, Math.min(4, Math.ceil(Math.log(1 + t.s) / Math.log(1 + max) * 5) - 1));
      (bk[t.dom + '|' + l] = bk[t.dom + '|' + l] || []).push(hexD(r.x, r.y));
      groupHeat[r.group] = (groupHeat[r.group] || 0) + t.s;
      clusterHeat[r.cl] = (clusterHeat[r.cl] || 0) + t.s;
    }
    for (const [k, ds] of Object.entries(bk)) { const [i, l] = k.split('|').map(Number); svg += `<path d="${ds.join('')}" fill="${Q.kw[i].col}" fill-opacity="${LV[l]}" stroke="${Q.kw[i].col}" stroke-width="${l >= 3 ? 1 : 0.5}"/>`; }
  }
  /* Newly placed code glows (the live map). */
  const fresh = map.regions.filter((r) => S.fresh.has(r.id));
  if (fresh.length) svg += `<path class="freshpath" d="${fresh.map((r) => hexD(r.x, r.y)).join('')}" fill="none" stroke="#141413" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  /* Selection: a box's outline, or a cluster's dashed outline with dotted lines to the clusters it shares code with. */
  const g0 = S.cg != null ? map.groups.find((g) => g.address === S.cg) : null, c0 = S.cc != null ? map.clusters[S.cc] : null;
  if (g0) svg += `<path d="${g0.edge}" fill="none" stroke="#141413" stroke-width="3.5" vector-effect="non-scaling-stroke"/>`;
  let links = 0;
  if (c0) {
    svg += `<path d="${c0.edge}" fill="none" stroke="#141413" stroke-width="2.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
    const lk = c0.links.map(([o]) => { const x = map.clusters[o]; return `M${c0.at[0]} ${c0.at[1]}L${x.at[0]} ${x.at[1]}`; }).join('');
    links = c0.links.length;
    if (lk) svg += `<path d="${lk}" fill="none" stroke="#141413" stroke-width="1.5" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>`;
  } else if (g0) {
    const lk = [];
    for (const id of g0.clusters) for (const [o] of map.clusters[id].links) if (map.clusters[o].group !== g0.id) lk.push(`M${map.clusters[id].at[0]} ${map.clusters[id].at[1]}L${map.clusters[o].at[0]} ${map.clusters[o].at[1]}`);
    links = lk.length;
    if (lk.length) svg += `<path d="${lk.join('')}" fill="none" stroke="#141413" stroke-width="1.5" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>`;
  }

  const gl = map.groups.map((g) => {
    const on = g0 && g0.id === g.id, n = groupHeat[g.id] || 0;
    const ink = on ? '#FFFFFF' : (lit.size && !n ? '#8A8E95' : '#141413');
    return `<button type="button" class="glab" data-group="${esc(g.address)}" style="left:${g.at[0].toFixed(1)}px;top:${(g.box.t - 8).toFixed(1)}px;border-color:${g.col};background:${on ? g.col : (n ? tint(g.col, 0.18) : '#FFFFFF')};color:${ink}">${esc(g.name)}${n ? ' · ' + n : ''}</button>`;
  }).join('');
  const cl = lod === 'c' ? map.clusters.filter((c) => c.size >= 3 || clusterHeat[c.id]).map((c) => {
    const n = clusterHeat[c.id] || 0;
    return `<div class="clab" style="left:${c.at[0].toFixed(1)}px;top:${c.at[1].toFixed(1)}px;${lit.size && !n ? 'color:#8A8E95;' : ''}">${esc(c.name)}${n ? ' · ' + n : ''}</div>`;
  }).join('') : '';

  const placed = cv.places.filter((p) => p.sections.length).length;
  stage.innerHTML = `<div class="cvp" id="cvp" data-lod="${lod}">` +
    `<div class="cworld" style="width:${map.W}px;height:${map.H}px;transform:translate(${V.tx}px, ${V.ty}px) scale(${V.z});--iz:${(1 / Math.max(0.45, Math.min(V.z, 1.6))).toFixed(3)}">` +
    `<svg width="${map.W}" height="${map.H}" aria-label="Code regions placed under the plan's boxes">${svg}</svg>${gl}${cl}</div>` +
    `<div class="codehead"><span class="n">${esc(cv.run.repo.split('/').pop())}</span><span class="m">plan: ${esc(cv.run.canvas)} · at ${esc(cv.run.head)} · map ${cv.run.id} · ${placed} placed, ${cv.places.length - placed} waiting</span>` +
    (S.fresh.size ? `<span class="news">${S.fresh.size} newly placed</span>` : '') + `</div>` +
    `<div class="repochips">${chips}<span style="flex:1"></span><span class="muted" style="font-size:12px;margin-right:8px">${links} ${links === 1 ? 'link' : 'links'} shown</span>` +
    `<button type="button" class="zb" data-zoom="fit">Fit</button><button type="button" class="zb" data-zoom="-1" aria-label="Zoom out">−</button><span class="zl">${Math.round(V.z * 100)}%</span><button type="button" class="zb" data-zoom="1" aria-label="Zoom in">+</button></div>` +
    `</div>`;
  renderCodePanel(cv, map, Q, lit, groupHeat, clusterHeat, placed);
}

function renderCodePanel(cv, map, Q, lit, groupHeat, clusterHeat, placed) {
  const P = $('panel');
  const crumbsHtml = () => {
    const parts = [['Code map', 'code', !S.cg && S.cc == null]];
    const g0 = S.cg != null ? map.groups.find((g) => g.address === S.cg) : (S.cc != null ? map.groups.find((g) => g.id === map.clusters[S.cc].group) : null);
    if (g0) parts.push([g0.name, 'g:' + g0.address, S.cc == null]);
    if (S.cc != null) parts.push([map.clusters[S.cc].name, '', true]);
    return `<nav class="pcrumbs">${parts.map(([n, go, last], i) => (i ? '<span class="arrow">›</span>' : '') + `<button type="button" class="crumb${last ? ' last' : ''}" data-pcrumb="${esc(go)}">${esc(n)}</button>`).join('')}</nav>`;
  };
  let trafficBox = '';
  if (Q.terms.length) {
    const rows = map.clusters.filter((c) => clusterHeat[c.id] && (S.cg == null || map.groups.find((g) => g.id === c.group).address === S.cg))
      .map((c) => ({ c, rank: clusterHeat[c.id] / Math.sqrt(c.size || 1) })).sort((a, b) => b.rank - a.rank).slice(0, 10);
    const top = rows.length ? rows[0].rank : 1;
    trafficBox = `<div class="trafficbox"><div class="k">Traffic · ${esc(Q.terms.join(' · '))}</div>` +
      `<p>${lit.size ? lit.size + ' regions lit, by their code, the plan box they sit under, their commits and their decisions.' : 'No region, plan box, commit or decision here mentions it.'}</p>` +
      `<div class="bars">${rows.map(({ c, rank }) => { const g = map.groups.find((x) => x.id === c.group); return `<button type="button" class="bar barbtn" data-cluster="${c.id}" title="${esc(g.name)}"><span class="nm">${esc(c.name)}</span><span class="tr"><i style="width:${Math.max(4, Math.round(rank / top * 100))}%;background:${g.col}"></i></span><span class="n">${clusterHeat[c.id]}</span></button>`; }).join('')}</div></div>`;
  }
  const clusterRow = (c, extra = '') => { const g = map.groups.find((x) => x.id === c.group);
    return `<button type="button" class="row" data-cluster="${c.id}"><span class="sw hexclip" style="background:${g.col};opacity:${g.wait ? 0.5 : 1}"></span><span class="nm">${esc(c.name)} <span class="muted" style="font-size:12px">${c.scope ? 'commit scope' : 'file'}</span>${extra}</span><span class="mt">${c.size}</span></button>`; };

  if (S.cc != null && map.clusters[S.cc]) {
    const c = map.clusters[S.cc], g = map.groups.find((x) => x.id === c.group);
    P.innerHTML = crumbsHtml() + `<div class="k">Cluster · ${c.scope ? 'commit scope' : 'file'}</div><h2>${esc(c.name)}</h2>` +
      `<p class="owner">${g.wait ? 'Not yet placed: the plan does not explain this code yet' : 'Under the plan box ' + esc(g.name)} · ${c.size} regions</p>` + trafficBox +
      (c.links.length ? `<h3>Shares code with</h3><div class="rows">${c.links.map(([o, n]) => clusterRow(map.clusters[o], ` · ${esc(map.groups.find((x) => x.id === map.clusters[o].group).name)}`).replace('<span class="mt">' + map.clusters[o].size + '</span>', `<span class="mt">${n} shared</span>`)).join('')}</div>` : '') +
      `<h3>Files</h3><div class="mono" style="line-height:1.7;white-space:pre-line">${esc(c.files.join('\n'))}</div>`;
    return;
  }
  const g0 = S.cg != null ? map.groups.find((g) => g.address === S.cg) : null;
  if (g0) {
    const near = cv.places.filter((p) => !p.sections.length && (p.near || [p.best]).includes(g0.address)).length;
    const words = cv.words[g0.address] || '';
    P.innerHTML = crumbsHtml() + `<div class="k">${g0.wait ? 'Code not yet placed' : 'Plan box'}</div><h2 style="color:${g0.col}">${esc(g0.name)}</h2>` +
      `<p class="owner">${g0.wait ? 'Code the plan does not explain yet. Update a box, or add one, for it to be placed.' : esc(g0.address.split(' > ')[0].replace(/ \(totem\)$/, '')) + ' · ' + esc(cv.run.canvas)}</p>` +
      `<div class="stats"><div><b>${g0.size}</b><span>regions</span></div><div><b>${g0.clusters.length}</b><span>clusters</span></div><div><b>${g0.wait ? '' : near}</b><span>${g0.wait ? '' : 'waiting near it'}</span></div></div>` +
      trafficBox + (words ? `<h3>The plan box says</h3><p>${esc(words.split('\n').slice(1).join('\n') || words)}</p>` : '') +
      `<h3>Its clusters</h3><div class="rows">${g0.clusters.slice().sort((a, b) => map.clusters[b].size - map.clusters[a].size).map((id) => clusterRow(map.clusters[id])).join('')}</div>`;
    return;
  }
  const reached = new Set(cv.places.flatMap((p) => p.sections));
  const noCode = cv.run.sections.filter((s) => !reached.has(s));
  P.innerHTML = crumbsHtml() + `<div class="k">Code map</div><h2>${esc(cv.run.repo.split('/').pop())}</h2>` +
    `<p>Each hexagon is one code region at ${esc(cv.run.head)}, under the plan box it does, judged by its commits and decisions. Inside a box, regions of one line of work - one commit scope - form a cluster. A region doing two boxes' work sits on the border between them (white dot). Zoom in for clusters; click to open a box or a cluster.</p>` +
    `<div class="legendgrid"><span><span class="sw-hex hexclip" style="background:#2F5BD3"></span>Placed under a plan box</span><span><span class="sw-hex hexclip" style="background:#8A8E95;opacity:.5"></span>Not yet placed</span><span><span class="sw-hex hexclip" style="background:#2F5BD3;opacity:.45"></span>Fainter: older code</span><span><span class="dotw"></span>Serves two boxes</span></div>` +
    `<div class="stats"><div><b>${placed}</b><span>placed</span></div><div><b>${cv.places.length - placed}</b><span>waiting</span></div><div><b>${noCode.length}</b><span>boxes with no code yet</span></div></div>` +
    trafficBox + `<h3>Plan boxes</h3><div class="rows">` +
    map.groups.map((g) => `<button type="button" class="row" data-group="${esc(g.address)}"><span class="sw hexclip" style="background:${g.col};opacity:${g.wait ? 0.5 : 1}"></span><span class="nm">${esc(g.name)}</span><span class="mt">${g.clusters.length} · ${g.size}</span></button>`).join('') +
    noCode.map((s) => `<div class="row plain"><span class="sw hexclip" style="background:#E6E2D8"></span><span class="nm">${esc(short(s))}</span><span class="mt">no code yet</span></div>`).join('') + `</div>`;
}

/* Pan and zoom on the code map; a click (not a drag) opens what is under it. */
let drag = null;
function codePointerDown(e) {
  const vp = e.target.closest('#cvp');
  if (!vp || e.button !== 0 || e.target.closest('button')) return;
  drag = { x: e.clientX, y: e.clientY, tx: S.cview.tx, ty: S.cview.ty, moved: false };
  vp.setPointerCapture(e.pointerId);
}
function codePointerMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (!drag.moved) return;
  S.cview.tx = drag.tx + dx; S.cview.ty = drag.ty + dy;
  const w = document.querySelector('.cworld');
  if (w) w.style.transform = `translate(${S.cview.tx}px, ${S.cview.ty}px) scale(${S.cview.z})`;
}
function codePointerUp(e) {
  if (!drag) return;
  const was = drag; drag = null;
  if (was.moved) return;
  const cv = S.code[S.repo], vp = $('cvp');
  if (!cv || !vp) return;
  const rect = vp.getBoundingClientRect(), map = mapOf(cv);
  const r = regionAt(map, (e.clientX - rect.left - S.cview.tx) / S.cview.z, (e.clientY - rect.top - S.cview.ty) / S.cview.z);
  if (!r) { S.cg = null; S.cc = null; return render(); }
  if (lodOf(S.cview.z) === 'g') { S.cg = map.groups.find((g) => g.id === r.group).address; S.cc = null; }
  else { S.cc = r.cl; S.cg = null; }
  render();
}
function zoomAt(px_, py_, z2) {
  const V = S.cview, z = Math.max(0.2, Math.min(4, z2));
  V.tx = px_ - (px_ - V.tx) * (z / V.z); V.ty = py_ - (py_ - V.ty) * (z / V.z); V.z = z;
  render();
}
document.addEventListener('pointerdown', codePointerDown);
document.addEventListener('pointermove', codePointerMove);
document.addEventListener('pointerup', codePointerUp);
document.addEventListener('wheel', (e) => {
  const vp = e.target.closest && e.target.closest('#cvp');
  if (!vp || !S.cview) return;
  e.preventDefault();
  const rect = vp.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, S.cview.z * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

/* ------------------------------------------------------------ chrome */

function renderChrome() {
  const Q = search();
  $('term').classList.toggle('on', !!S.query.trim());
  $('chips').innerHTML = CHIPS.map((c) => `<button type="button" class="pill${S.query.trim().toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  const target = S.m ? boardTarget() : null;
  $('tabs').innerHTML = [['Main', 'main', 'The hexagon map: find things'], ['Code', 'code', 'The code map: the plan and its code'],
    ['Canvas', 'canvas', target ? 'Open the ' + S.m.reg[target].name + ' canvas, as CanvasX shows it' : 'Pick a canvas on the map first']].map(([l, k, why]) =>
    `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${S.tab === k}" title="${esc(why)}"${k === 'canvas' && !target ? ' disabled' : ''}>${l}</button>`).join('');
  let crumbs;
  if (S.tab === 'main' && S.m) crumbs = S.path.filter((id) => S.m.reg[id]).map((id, i, arr) => ({ name: S.m.reg[id].name, go: i < arr.length - 1 ? 'path:' + i : '' }));
  else if (S.tab === 'canvas' && S.m && S.bcanvas) crumbs = [{ name: 'Map', go: 'path:0' }, { name: S.m.reg[S.bcanvas].name, go: 'canvas:' + S.bcanvas }, { name: 'Open canvas', go: '' }];
  else crumbs = [{ name: 'Code map', go: '' }].concat(S.repo ? [{ name: S.repo.split('/').pop(), go: '' }] : []);
  $('crumbs').innerHTML = crumbs.map((c, i) => (i ? '<span class="arrow" aria-hidden="true">›</span>' : '') + `<button type="button" class="crumb${c.go ? '' : ' last'}" data-crumb="${c.go}">${esc(c.name)}</button>`).join('');
  const shown = Q.kw.map((k, i) => ({ k, i })).filter(({ i }) => Q.on[i].shown);
  $('kwf').hidden = !shown.length;
  $('kwf').innerHTML = shown.length ? `<span class="lead">Show</span>` + shown.map(({ k, i }) => {
    const on = Q.on[i].on;
    return `<button type="button" class="kw" data-kw="${esc(k.key)}" aria-pressed="${on}" title="${esc(k.auto ? 'Found side by side' : 'Your keyword')}" style="border:1.5px ${k.auto ? 'dashed' : 'solid'} ${k.col};opacity:${on ? 1 : 0.5}"><span class="dot" style="background:${on ? k.col : '#FFFFFF'};border:1.5px solid ${k.col}"></span>${esc(k.key)}<span class="n">${Q.global[i]}</span></button>`;
  }).join('') : '';
}

export function render() {
  renderChrome();
  $('panel').hidden = S.tab === 'canvas';
  if (S.tab === 'code') renderCode();
  else if (S.tab === 'canvas') renderBoard();
  else renderMain();
}

/* ------------------------------------------------------------ the open canvas */

/* The canvas the Canvas tab opens: the one being looked at on the Main map,
   else the one opened last, else the first. */
function boardTarget() {
  const reg = S.m.reg;
  if (S.sel && reg[S.sel]) return reg[S.sel].canvas;
  if (S.path.length > 1 && reg[S.path[1]]) return S.path[1];
  if (S.bcanvas && reg[S.bcanvas]) return S.bcanvas;
  return reg.root.children[0] || null;
}

const WIRE = ['#B0447A', '#2F5BD3', '#C2571A', '#1F7A6E', '#6B4FBB'];

function renderBoard() {
  const stage = $('stage'), reg = S.m.reg, cid = S.bcanvas;
  if (!cid || !reg[cid]) { stage.innerHTML = '<div class="status">Pick a canvas on the map first.</div>'; return; }
  const Q = search(), on = Q.kw.map((k, i) => Q.on[i].on);
  const hot = (it) => Q.terms.length && hitsOf(Q.kw, it.name + ' ' + it.text).some((v, i) => v > 0 && on[i]);
  const { html, totems } = boardHtml(S.m, cid, palOf, hot, Q.terms[0] || '');
  const x = reg[cid];
  stage.innerHTML = `<div class="bvp" id="bvp"><div class="bworld" id="bworld">${html}</div>` +
    `<div class="bbanner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>` +
    `<div class="bbt"><b>The whole ${esc(x.name)} canvas.</b> ${x.agent ? 'An agent canvas: agents rewrite it one totem script at a time, through NoteX.' : 'Your own canvas in File Fabric; edit it there.'} Drag to move, scroll to zoom.</div>` +
    `<button type="button" class="bback" data-tab="main">Back to map</button></div>` +
    `<div class="bbar"><button type="button" class="bfit" data-bfit="1">Whole canvas</button>` +
    totems.map((t) => `<button type="button" class="bchip" data-btotem="${t.id}"><span class="sw" style="background:${t.swatch}"></span>${esc(t.name)}</button>`).join('') +
    `<span style="flex:1"></span><span class="muted" style="font-size:12px;margin-right:8px" id="bwires"></span>` +
    `<button type="button" class="zb" data-bzoom="-1" aria-label="Zoom out">−</button><span class="zl" id="bzl"></span><button type="button" class="zb" data-bzoom="1" aria-label="Zoom in">+</button></div></div>`;
  const world = $('bworld');
  const place = () => {
    if (!S.bview || S.bview.cid !== cid) S.bview = { cid, ...boardFit(worldRect(world, 1, null)) };
    applyBoard();
    /* Wires are measured at the zoom in force, then drawn in the board's own pixels. */
    const pairs = S.m.blinks.filter((l) => reg[l.a] && reg[l.a].canvas === cid)
      .map((l) => ({ a: `[data-bid="${l.a}"]`, b: `[data-bid="${l.b}"]`, color: WIRE[(reg[reg[l.a].totem].pal || 0) % WIRE.length] }));
    const wires = routeWires(world, S.bview.z, pairs, '[data-bid], [data-obst]', 6);
    world.insertAdjacentHTML('beforeend', wiresHtml(wires));
    const n = $('bwires'); if (n) n.textContent = wires.length + (wires.length === 1 ? ' link' : ' links');
  };
  /* Fonts change box sizes, so measure once they are in. */
  requestAnimationFrame(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(place) : place()));
}

function boardFit(r) {
  const { w, h } = stageSize(), top = 84, bottom = 70;
  const z = Math.max(0.05, Math.min(1.1, (w - 80) / r.w, (h - top - bottom) / r.h));
  return { z, tx: (w - r.w * z) / 2 - r.l * z, ty: top + (h - top - bottom - r.h * z) / 2 - r.t * z };
}

function applyBoard() {
  const world = $('bworld'), vp = $('bvp'), V = S.bview;
  if (!world || !V) return;
  world.style.transform = `translate(${V.tx}px, ${V.ty}px) scale(${V.z})`;
  const dot = Math.max(8, 24 * V.z);
  vp.style.backgroundSize = dot + 'px ' + dot + 'px';
  vp.style.backgroundPosition = V.tx + 'px ' + V.ty + 'px';
  const zl = $('bzl'); if (zl) zl.textContent = Math.round(V.z * 100) + '%';
}

function boardZoomAt(px_, py_, z2) {
  const V = S.bview, z = Math.max(0.05, Math.min(2.5, z2));
  V.tx = px_ - (px_ - V.tx) * (z / V.z); V.ty = py_ - (py_ - V.ty) * (z / V.z); V.z = z;
  applyBoard();
}

let bdrag = null;
document.addEventListener('pointerdown', (e) => {
  const vp = e.target.closest && e.target.closest('#bvp');
  if (!vp || e.button !== 0 || e.target.closest('button') || !S.bview) return;
  bdrag = { x: e.clientX, y: e.clientY, tx: S.bview.tx, ty: S.bview.ty };
  vp.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!bdrag) return;
  S.bview.tx = bdrag.tx + e.clientX - bdrag.x; S.bview.ty = bdrag.ty + e.clientY - bdrag.y;
  applyBoard();
});
document.addEventListener('pointerup', () => { bdrag = null; });
document.addEventListener('wheel', (e) => {
  const vp = e.target.closest && e.target.closest('#bvp');
  if (!vp || !S.bview) return;
  e.preventDefault();
  const rect = vp.getBoundingClientRect();
  boardZoomAt(e.clientX - rect.left, e.clientY - rect.top, S.bview.z * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

/* ------------------------------------------------------------ events */

function go(path, sel, x, y, dir) { Object.assign(S, { path, sel, ox: x, oy: y, dir, tick: S.tick + 1 }); render(); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, polygon');
  if (!t) return;
  const d = t.dataset;
  if (d.act === 'open') return go(pathTo(S.m.reg, d.id), null, +d.x || 0, +d.y || 0, 1);
  if (d.act === 'read') { S.sel = d.id; return render(); }
  if (d.crumb) {
    if (d.crumb.startsWith('canvas:')) { S.tab = 'main'; return go(pathTo(S.m.reg, d.crumb.slice(7)), null, 0, 0, -1); }
    if (d.crumb.startsWith('path:')) { S.tab = 'main'; return go(S.path.slice(0, +d.crumb.slice(5) + 1), null, 0, 0, -1); }
  }
  if (d.tab) {
    if (S.tab !== d.tab) {
      if (d.tab === 'canvas') { const t = boardTarget(); if (t !== S.bcanvas) S.bview = null; S.bcanvas = t; }
      S.tab = d.tab; if (d.tab === 'code') loadCode(); render();
    }
    return;
  }
  if (d.bfit) { S.bview = null; return render(); }
  if (d.btotem) { const r = worldRect($('bworld'), S.bview.z, `[data-tid="${d.btotem}"]`); if (r) { Object.assign(S.bview, boardFit(r)); applyBoard(); } return; }
  if (d.bzoom) { const { w, h } = stageSize(); return boardZoomAt(w / 2, h / 2, S.bview.z * (d.bzoom === '1' ? 1.25 : 0.8)); }
  if (d.chip) { const on = S.query.trim().toLowerCase() === d.chip.toLowerCase(); S.query = on ? '' : d.chip; S.off = {}; $('term').value = S.query; return render(); }
  if (d.kw) { S.off[d.kw] = !S.off[d.kw]; return render(); }
  if (d.repo) { S.repo = d.repo; S.cg = null; S.cc = null; S.fresh = new Set(); try { localStorage.setItem('automatu.repo', d.repo); } catch (_) {} loadCode(); return render(); }
  if (d.group !== undefined) { S.cg = S.cg === d.group ? null : d.group; S.cc = null; return render(); }
  if (d.cluster !== undefined) { S.cc = +d.cluster; S.cg = null; return render(); }
  if (d.pcrumb !== undefined) { if (d.pcrumb === 'code') { S.cg = null; S.cc = null; } else if (d.pcrumb.startsWith('g:')) { S.cg = d.pcrumb.slice(2); S.cc = null; } return render(); }
  if (d.zoom) {
    if (d.zoom === 'fit') { const cv = S.code[S.repo]; if (cv) S.cview = { repo: S.repo, ...fitView(mapOf(cv)) }; return render(); }
    const { w, h } = stageSize(); return zoomAt(w / 2, h / 2, S.cview.z * (d.zoom === '1' ? 1.25 : 0.8));
  }
});

let typing = null;
$('term').addEventListener('input', (e) => { clearTimeout(typing); typing = setTimeout(() => { S.query = e.target.value; S.off = {}; render(); }, 180); });

document.addEventListener('pointermove', (e) => {
  const vp = e.target.closest && e.target.closest('#cvp'), tip = $('tip'), cv = S.code[S.repo];
  if (!vp || !cv || drag || e.target.closest('button')) { tip.hidden = true; return; }
  const rect = vp.getBoundingClientRect(), map = mapOf(cv);
  const r = regionAt(map, (e.clientX - rect.left - S.cview.tx) / S.cview.z, (e.clientY - rect.top - S.cview.ty) / S.cview.z);
  if (!r) { tip.hidden = true; return; }
  const g = map.groups.find((x) => x.id === r.group), c = map.clusters[r.cl];
  tip.textContent = lodOf(S.cview.z) === 'g' ? g.name + '\nclick for the plan box'
    : r.name + '\n' + r.file + '\n' + c.name + ' · ' + g.name +
      (r.sections.length > 1 ? '\nalso ' + r.sections.slice(1).map(short).join(', ') : '') +
      (r.sections.length ? '' : '\nwould join ' + r.near.map(short).join(' + ')) + '\nscore ' + r.score.toFixed(3);
  tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + 'px';
});

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (S.tab === 'main' && S.sel) { S.sel = null; render(); }
  else if (S.tab === 'main' && S.path.length > 1) go(S.path.slice(0, -1), null, 0, 0, -1);
  else if (S.tab === 'code' && (S.cg != null || S.cc != null)) { S.cg = null; S.cc = null; render(); }
});

let resizing = null;
addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { S.tick = 0; S.cview = null; render(); }, 120); });

/* ------------------------------------------------------------ data */

async function getJson(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || 'the server answered ' + r.status);
  return j;
}

export async function loadCode() {
  if (!S.repo) return;
  try {
    S.code[S.repo] = await getJson('/api/code?repo=' + encodeURIComponent(S.repo));
    S.codeFailed = '';
    if (S.pendingBox) { S.cg = S.code[S.repo].run.sections.find((s) => short(s).toLowerCase() === S.pendingBox.toLowerCase()) || null; S.pendingBox = null; }
  } catch (e) { S.codeFailed = 'Could not read the code map: ' + e.message; }
  if (S.tab === 'code') render();
}

/* A link can open a view: ?tab=code&repo=<name>&box=<box name>&q=<keywords>
   or ?open=<canvas>>…>(box name) on the Main map - for sharing a view or
   recording one. */
function fromLink() {
  const u = new URLSearchParams(location.search);
  if (u.get('q')) { S.query = u.get('q'); $('term').value = S.query; }
  if (u.get('repo')) { const r = S.repos.find((x) => x.repo.split('/').pop().toLowerCase() === u.get('repo').toLowerCase()); if (r) S.repo = r.repo; }
  if (u.get('tab') === 'code') S.tab = 'code';
  if (u.get('tab') === 'canvas' && S.m) {
    const name = (u.get('canvas') || '').toLowerCase();
    S.bcanvas = S.m.reg.root.children.find((id) => S.m.reg[id].name.toLowerCase() === name) || S.m.reg.root.children[0];
    S.tab = 'canvas';
  }
  if (u.get('box')) S.pendingBox = u.get('box');
  if (u.get('open') && S.m) {
    let at = 'root';
    for (const name of u.get('open').split('>').map((s) => s.trim())) {
      const x = S.m.reg[at], next = x.children.concat(x.subs).find((id) => S.m.reg[id].name === name);
      if (!next) break;
      at = next;
    }
    if (at !== 'root') { if (isLeaf(S.m.reg, at)) { S.path = pathTo(S.m.reg, S.m.reg[at].parent); S.sel = at; } else S.path = pathTo(S.m.reg, at); }
  }
}

async function start() {
  render();
  try {
    const [cv, rp] = await Promise.all([getJson('/api/canvases'), getJson('/api/repos')]);
    S.m = model(cv.canvases);
    S.repos = rp.repos;
    let saved = null;
    try { saved = localStorage.getItem('automatu.repo'); } catch (_) {}
    S.repo = (S.repos.find((r) => r.repo === saved) || S.repos[0] || {}).repo || null;
    fromLink();
  } catch (e) { S.failed = 'Could not load the canvases: ' + e.message; }
  render();
  if (S.repo) loadCode();
  setInterval(() => follow().catch(() => {}), 4000);
}

/* The live map (t-5b98c27370): the server makes a new map on every commit or
   plan change; the page notices, reads it, and redraws in place - the zoom,
   the selection and the search stay - with the code placed since the map
   before glowing for a moment. A new map can also mean the plan changed, so
   the canvases are read again too. */
async function follow() {
  const { repos } = await getJson('/api/repos');
  const before = new Map(S.repos.map((r) => [r.repo, r.id]));
  S.repos = repos;
  const changed = repos.filter((r) => before.get(r.repo) !== r.id);
  if (!changed.length) return;
  const cv = await getJson('/api/canvases');
  const m = model(cv.canvases);
  /* Keep the Main map where it was, when what it points at is still there. */
  const keep = S.path.map((id) => S.m && S.m.reg[id] && pathTo(S.m.reg, id).map((x) => S.m.reg[x].name).join('>'));
  S.m = m; S.layouts = {}; S.memo = {};
  const byPath = {};
  for (const id of Object.keys(m.reg)) byPath[pathTo(m.reg, id).map((x) => m.reg[x].name).join('>')] = id;
  S.path = keep.map((k) => byPath[k]).filter(Boolean);
  if (!S.path.length) S.path = ['root'];
  if (S.sel && S.m.reg[S.sel] === undefined) S.sel = null;
  for (const r of changed) {
    const old = S.code[r.repo];
    if (!old && r.repo !== S.repo) continue;
    const next = await getJson('/api/code?repo=' + encodeURIComponent(r.repo));
    if (r.repo === S.repo && old) {
      const was = new Map(old.places.map((p) => [p.region, p.sections.join('|')]));
      S.fresh = new Set(next.places.filter((p) => p.sections.length && was.get(p.region) !== p.sections.join('|')).map((p) => p.region));
      setTimeout(() => { S.fresh = new Set(); if (S.tab === 'code') render(); }, 6500);
    }
    S.code[r.repo] = next;
  }
  render();
}

start();
