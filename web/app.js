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
import { boardHtml, picHtml, routeWires, wiresHtml, worldRect } from './board.js';
import { addressOf, indexRelations, relationLayout } from './relate.js';
import { layoutNet, edgeStyle, KCOL } from './thoughtnet.js';
import { scaleOf, phaseAt, ist, lastMapIn, snapTargets, timeAt, nearestTarget, mapAtOrBefore, hexChanges, popDelay } from './timeline.js';

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
  m: null, failed: '', layouts: {}, memo: {}, rel: {},
  tl: {}, tPhase: null, tRun: null, past: {}, tMoment: null,
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
  const cv = S.tRun ? curCode() : S.code[S.repo];
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
  let cellList = [], F, ids = [], arranged = null;
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
    /* Boxes placed by relation once the canvas's relations are in; until
       then, and with nothing to relate, in reading order. */
    const kids = node.children, R = relFor(reg[node.canvas].name);
    let coords;
    if (R.state === 'ok' && kids.length > 1) {
      const A = Object.fromEntries(kids.map((id) => [id, addressOf(reg, id)]));
      const L = S.layouts[view] || (S.layouts[view] = relationLayout(kids, (a, b) => { const e = R.idx.edge(A[a], A[b]); return e ? e.w : 0; }));
      coords = kids.map((id) => L.cells[id]);
      arranged = L.groups;
    } else coords = spiral(Math.max(kids.length, 1));
    cellList = kids.length ? coords : [];
    F = fit(coords, 210, 80, w, h);
    kids.forEach((id, i) => {
      const leaf = isLeaf(reg, id);
      cells.push(cellFor(id, F.at(coords[i]), F.W, F.H, { kind: 'box', leaf, maxFs: 17,
        sub: (arranged && arranged.bridges[id] ? 'bridge · ' : '') + (leaf ? countOf(reg, id) : reg[id].children.length + ' boxes inside') }));
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

  renderMainPanel(reg, view, node, ids.length ? ids : node.children, Q, heat, heatArr, arranged);
}

/* A canvas's relations, asked for once; the page redraws when they arrive. */
function relFor(name) {
  if (!S.rel[name]) {
    S.rel[name] = { state: 'loading' };
    getJson('/api/relations?canvas=' + encodeURIComponent(name))
      .then((j) => { S.rel[name] = { state: 'ok', idx: indexRelations(j) }; })
      .catch((e) => { S.rel[name] = { state: 'failed', msg: e.message }; })
      .then(() => { S.layouts = {}; if (S.tab === 'main') render(); });
  }
  return S.rel[name];
}

const placeOf = (address) => address.split(' > ').slice(0, -1).map((s) => s.replace(/ \((totem|sub-totem)\)$/, '')).join(' › ');

/* Why a box sits where it does: what it is related to here and why, whether
   it is a bridge or alone, what it relates to elsewhere on the canvas, and
   where the code and the canvas disagree. */
function whyHere(reg, id, G, R) {
  if (!R || R.state !== 'ok') return R && R.state === 'failed' ? `<h3>Why it sits here</h3><p class="muted">Relations could not be read: ${esc(R.msg)}</p>` : '';
  const kids = reg[reg[id].parent].children, A = addressOf(reg, id);
  const inView = new Map(kids.map((k) => [addressOf(reg, k), k]));
  const lines = [];
  const reason = (e) => esc(e.why.join('; ')) + (e.disagree ? ` <span class="dis">${esc(e.disagree)}</span>` : '');
  if (G && G.bridges[id]) lines.push(`<p><b>A bridge</b> between ${G.bridges[id].map((ci) => G.clusters[ci].map((k) => esc(reg[k].name)).join(', ')).map((s) => '<i>' + s + '</i>').join(' and ')}.</p>`);
  const here = kids.filter((k) => k !== id).map((k) => ({ k, e: R.idx.edge(A, addressOf(reg, k)) })).filter((x) => x.e);
  const kept = here.filter(({ k }) => !G || !G.cut.some((c) => (c[0] === id && c[1] === k) || (c[1] === id && c[0] === k)));
  const cutOff = here.filter((x) => !kept.includes(x));
  if (kept.length) lines.push(`<div class="why">` + kept.map(({ k, e }) => `<div><button type="button" class="lk" data-act="read" data-id="${k}">${esc(reg[k].name)}</button> ${reason(e)}</div>`).join('') + `</div>`);
  else if (!(G && G.bridges[id])) lines.push(`<p><b>Alone here:</b> nothing else in this view is related to it.</p>`);
  if (cutOff.length) lines.push(`<p class="muted">Also related to ${cutOff.map(({ k }) => esc(reg[k].name)).join(', ')}, but kept in a separate group so this one does not grow into one lump.</p>`);
  const away = R.idx.of(A).map((e) => (e.a === A ? e.b : e.a)).filter((o) => !inView.has(o) && !o.startsWith(A + ' > ') && !A.startsWith(o + ' > '));
  if (away.length) lines.push(`<h3>Related elsewhere on the canvas</h3><div class="why">` + away.slice(0, 8).map((o) => `<div><b>${esc(short(o))}</b> <span class="muted">in ${esc(placeOf(o))}</span> ${reason(R.idx.edge(A, o))}</div>`).join('') + `</div>`);
  const apart = (R.idx.data.apart || []).filter((e) => e.a === A || e.b === A);
  if (apart.length) lines.push(`<h3>Kept apart by the code</h3><div class="why">` + apart.map((e) => { const o = e.a === A ? e.b : e.a; return `<div><b>${esc(short(o))}</b> <span class="dis">${esc(e.disagree)}</span></div>`; }).join('') + `</div>`);
  return `<h3>Why it sits here</h3>` + lines.join('');
}

/* How a view's boxes are arranged: its clusters, bridges and boxes alone. */
function arrangedHtml(reg, G, R) {
  if (!R) return '';
  if (R.state === 'loading') return `<h3>Arranged by relation</h3><p class="muted">Working out which boxes belong together…</p>`;
  if (R.state === 'failed') return `<h3>Arranged by relation</h3><p class="muted">Shown in canvas order: ${esc(R.msg)}</p>`;
  if (!G) return '';
  const groups = G.clusters.filter((c) => c.length > 1), alone = G.clusters.filter((c) => c.length === 1 && !G.bridges[c[0]]).map((c) => c[0]);
  const note = R.idx.data.meaning ? '' : `<p class="muted">${esc(R.idx.data.note || 'Closeness in meaning is off.')}</p>`;
  return `<h3>Arranged by relation</h3><p>Related boxes touch; groups and boxes alone sit one hexagon apart. Pick a box to see why it is where it is.</p>` + note +
    `<div class="why">` +
    groups.map((c, i) => `<div><b>Group ${i + 1}:</b> ${c.map((k) => esc(reg[k].name)).join(', ')}</div>`).join('') +
    Object.keys(G.bridges).map((b) => `<div><b>Bridge:</b> ${esc(reg[b].name)}</div>`).join('') +
    (alone.length ? `<div><b>Alone:</b> ${alone.map((k) => esc(reg[k].name)).join(', ')}</div>` : '') + `</div>`;
}

function viewKind(reg, node) {
  if (node.kind === 'canvas') return node.agent ? 'Agent canvas' : 'Canvas';
  if (node.kind === 'totem') return 'Totem: its own boxes';
  if (node.kind === 'sub') return 'Sub-totem of ' + reg[node.totem].name;
  return 'Box in ' + pathTo(reg, node.parent).slice(1).map((k) => reg[k].name).join(' › ');
}

function contentHtml(c) {
  return `<div class="item"><div class="hd"><span class="lb">${esc(c.label)}</span><span class="nm">${esc(c.name)}</span>${c.edited ? '<span class="ed">edited by you</span>' : ''}</div>` +
    (c.src ? picHtml(c, 'pimg') : '') +
    (c.text ? `<div class="tx">${esc(c.text)}</div>` : '') + `</div>`;
}

function renderMainPanel(reg, view, node, rowIds, Q, heat, heatArr, arranged) {
  const P = $('panel'), m = S.m;
  const R = view !== 'root' && node.kind !== 'canvas' ? S.rel[reg[node.canvas].name] : null;
  if (S.sel && reg[S.sel]) {
    const it = reg[S.sel], p = palOf(reg, S.sel);
    const links = m.blinks.filter((l) => l.a === S.sel || l.b === S.sel).map((l) => (l.a === S.sel ? { dir: 'to', other: l.b, title: l.bn } : { dir: 'from', other: l.a, title: l.an }));
    P.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="chip" style="background:${p.fill};color:${p.ink}">Box</span><span class="where">in ${esc(pathTo(reg, it.parent).slice(1).map((k) => reg[k].name).join(' › '))}</span></div>` +
      `<h2 style="margin:10px 0 16px">${esc(it.name)}</h2>` + whyHere(reg, S.sel, arranged, R) + it.content.map(contentHtml).join('') +
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
    traffic + own + arrangedHtml(reg, arranged, R) + (rows ? `<h3>Inside</h3><div class="rows">${rows}</div>` : '');
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

/* The map shown on the Code tab: the newest, or an earlier one picked on the
   timeline (t-25f10ce5fd). */
function curCode() {
  if (!S.tRun) return S.code[S.repo];
  const v = ensurePast(S.tRun);
  if (v && !v.loading && !v.failed) return v;
  if (v && v.failed) return null;
  /* While it loads, the nearest map before it that is in stands in, so the
     map never flashes empty while scrubbing (t-a6d44609ab). */
  const T = S.tl[S.repo];
  if (T && T.maps) {
    const want = T.maps.findIndex((m) => m.id === S.tRun);
    for (let i = want - 1; i >= 0; i--) { const p = S.past[S.repo + '#' + T.maps[i].id]; if (p && !p.loading && !p.failed) return p; }
  }
  return S.lastCv && S.lastCv.run.repo === S.repo ? S.lastCv : null;
}

/* Every earlier map is fetched in the background once the timeline is in, two
   at a time, and laid out while the page is idle - an earlier map takes ~0.4 s
   to arrive, longer than the scrubber rests on one (t-a6d44609ab). */
const waiting = {};
function prefetchPast(T) {
  const latest = T.maps[T.maps.length - 1];
  const queue = T.maps.filter((m) => !latest || m.id !== latest.id).map((m) => m.id).reverse();
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
  const next = () => {
    const run = queue.shift();
    if (run == null) return;
    const key = S.repo + '#' + run, v = ensurePast(run);
    const done = () => { const p = S.past[key]; if (p && p.run) idle(() => mapOf(p)); next(); };
    if (v.loading) (waiting[key] = waiting[key] || []).push(done); else done();
  };
  next(); next();
}

/* An earlier map, asked for once; the page redraws when it arrives if it is
   still the one wanted. */
function ensurePast(run) {
  const key = S.repo + '#' + run;
  if (!S.past[key]) {
    S.past[key] = { loading: true };
    getJson('/api/code?repo=' + encodeURIComponent(S.repo) + '&run=' + run)
      .then((j) => { S.past[key] = j; })
      .catch((e) => { S.past[key] = { failed: e.message }; })
      .then(() => {
        const w = waiting[key]; delete waiting[key]; if (w) w.forEach((f) => f());
        if (S.tab === 'code' && S.tRun === run) scheduleRender();
      });
  }
  return S.past[key];
}

/* Hexagons hold still when the system asks for less motion. */
const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

/* One redraw per frame at most. */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

/* A repository's timeline, read once and again whenever a new map arrives. */
function loadTimeline(force) {
  if (!S.repo || (S.tl[S.repo] && !force)) return;
  const repo = S.repo;
  S.tl[repo] = S.tl[repo] || { loading: true };
  getJson('/api/timeline?repo=' + encodeURIComponent(repo))
    .then((j) => {
      S.tl[repo] = j;
      if (repo === S.repo) prefetchPast(j);
      /* ?phase=N or ?moment=<time> from a link, once the timeline is in. */
      if (S.pendingPhase != null && j.phases[S.pendingPhase - 1]) {
        const p = j.phases[S.pendingPhase - 1], m = lastMapIn(j.maps, p.start, p.end), latest = j.maps[j.maps.length - 1];
        S.tPhase = S.pendingPhase - 1; S.tRun = m && latest && m.id !== latest.id ? m.id : null; S.cview = null;
      }
      S.pendingPhase = null;
      if (S.pendingMoment) { S.tPhase = phaseAt(j.phases, S.pendingMoment); const w = S.pendingMoment; S.pendingMoment = null; pickMoment(w); }
    })
    .catch((e) => { S.tl[repo] = { failed: e.message }; })
    .then(() => { if (S.tab === 'code') render(); });
}

function pickMoment(when) {
  S.tMoment = { when, loading: true };
  render();
  getJson('/api/plan-at?repo=' + encodeURIComponent(S.repo) + '&when=' + encodeURIComponent(when))
    .then((j) => { if (S.tMoment && S.tMoment.when === when) S.tMoment = { when, data: j }; })
    .catch((e) => { if (S.tMoment && S.tMoment.when === when) S.tMoment = { when, failed: e.message }; })
    .then(() => render());
}

/* Level of detail by zoom: plan boxes only, then their clusters too. */
/* Zoom levels: plan boxes, then clusters, then single code regions. */
const lodOf = (z) => (z < 0.6 ? 'g' : z < 1.5 ? 'c' : 'r');

function fitView(map) {
  const { w, h } = stageSize(), top = 64, bottom = 64;
  const z = Math.min(2.2, (w - 48) / map.W, (h - top - bottom) / map.H);
  return { z, tx: (w - map.W * z) / 2, ty: top + (h - top - bottom - map.H * z) / 2 };
}

function renderCode() {
  const stage = $('stage');
  if (!S.repos.length) { stage.innerHTML = `<div class="status">${esc(S.codeFailed || 'No map made yet. Bind a repository to its canvas: automatu bind <repo> <canvas> --totem <plan totem>')}</div>`; $('panel').innerHTML = ''; return; }
  loadTimeline();
  const cv = curCode();
  const chips = S.repos.map((r) => `<button type="button" class="repochip${r.repo === S.repo ? ' on' : ''}" data-repo="${esc(r.repo)}">${esc(r.repo.split('/').pop())}</button>`).join('');
  if (!cv) {
    const pf = S.tRun && S.past[S.repo + '#' + S.tRun];
    stage.innerHTML = `<div class="status">${esc(S.codeFailed || (pf && pf.failed) || (S.tRun ? 'Reading the earlier map…' : 'Reading the code map…'))}</div>${timelineHtml()}<div class="repochips">${chips}</div>`;
    $('panel').innerHTML = ''; return;
  }
  S.lastCv = cv;
  const map = mapOf(cv), Q = search();
  if (!S.cview || S.cview.repo !== S.repo) S.cview = { repo: S.repo, ...fitView(map) };
  const V = S.cview, lod = lodOf(V.z);

  /* Fills: by plan box, fainter for older code and for code not yet placed. */
  const fills = {}, days = (d) => (map.newest && d ? (Date.parse(map.newest) - Date.parse(d)) / 864e5 : 0);
  const look = new Map();
  for (const r of map.regions) {
    const g = map.groups.find((x) => x.id === r.group), age = days(r.fresh), b = age <= 7 ? 0 : age <= 21 ? 1 : 2;
    const gone = cv.regions[r.id] && cv.regions[r.id].gone;
    look.set(r.id, { x: r.x, y: r.y, col: g.col, op: gone ? 0.22 : (g.wait ? 0.45 : 0.9) * [1, 0.72, 0.5][b], k: g.id + '|' + (gone ? 'gone' : b) });
  }
  /* When the map shown changes, the hexagons that changed move instead of the
     whole map flipping (t-31818c0346): only they are drawn one by one. */
  /* A motion outlives a redraw: the panel filling in, or a map arriving, must
     not cut it short - it carries on from where it was. */
  const key = S.repo + '#' + cv.run.id, now = performance.now();
  if (S.shown && S.shown.repo === S.repo && S.shown.key !== key && !REDUCED()) S.motion = { key, prev: S.shown.pos, start: now, td: S.tDrag ? 260 : 420 };
  const mo = S.motion && S.motion.key === key && now - S.motion.start < S.motion.td + 300 ? S.motion : null;
  const prev = mo ? mo.prev : null, el = mo ? now - mo.start : 0;
  const ch = prev ? hexChanges(prev, look) : null, single = new Set();
  /* Each moving shape is its own small layer that the graphics card slides or
     scales; moving it inside the map's one SVG repainted the whole map on
     every frame (t-c4b73fa51a). */
  let moving = '';
  if (ch) {
    const spread = 160 * mo.td / 420, R = map.S + 1, wait = (ms) => `animation-delay:${(ms - el).toFixed(0)}ms`;
    const layer = (cls, pts, d, fill, op, style) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x - R); y0 = Math.min(y0, y - R); x1 = Math.max(x1, x + R); y1 = Math.max(y1, y + R); }
      const w = (x1 - x0).toFixed(1), h = (y1 - y0).toFixed(1);
      return `<svg class="hxl ${cls}" aria-hidden="true" width="${w}" height="${h}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w} ${h}" style="left:${x0.toFixed(1)}px;top:${y0.toFixed(1)}px;${style}"><path d="${d}" fill="${fill}" fill-opacity="${op.toFixed(2)}"/></svg>`;
    };
    for (const id of ch.leave) { const p = prev.get(id); moving += layer('hout', [[p.x, p.y]], hexD(p.x, p.y), p.col, p.op, wait(popDelay(id, spread * 0.5))); }
    for (const id of ch.enter) { const n = look.get(id); single.add(id); moving += layer('hin', [[n.x, n.y]], hexD(n.x, n.y), n.col, n.op, wait(spread * 0.4 + popDelay(id, spread))); }
    /* Hexagons sliding by the same amount - most often a whole cluster moved -
       slide as one layer, so a few dozen layers move instead of hundreds. */
    const slides = {};
    for (const id of ch.move.concat(ch.recolour)) {
      const n = look.get(id), p = prev.get(id), dx = Math.round((p.x - n.x) * 2) / 2, dy = Math.round((p.y - n.y) * 2) / 2;
      single.add(id);
      const k = dx + '|' + dy + '|' + p.col + '|' + n.col + '|' + n.op.toFixed(2);
      const m = (slides[k] = slides[k] || { dx, dy, from: p.col, col: n.col, op: n.op, d: [], pts: [] });
      m.d.push(hexD(n.x, n.y)); m.pts.push([n.x, n.y]);
    }
    for (const m of Object.values(slides)) {
      moving += layer((m.dx || m.dy ? 'hmv' : '') + (m.from !== m.col ? ' hrc' : ''), m.pts, m.d.join(''), m.col, m.op, `--dx:${m.dx}px;--dy:${m.dy}px;--from:${m.from};${wait(0)}`);
    }
  }
  S.shown = { repo: S.repo, key, pos: look };
  let dots = '';
  for (const r of map.regions) {
    const L = look.get(r.id);
    if (!single.has(r.id)) (fills[L.k] = fills[L.k] || { col: L.col, op: L.op, d: [] }).d.push(hexD(r.x, r.y));
    if (r.also.length) dots += 'M' + (r.x - 2.6).toFixed(1) + ' ' + r.y.toFixed(1) + 'a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0';
  }
  let svg = Object.values(fills).map((f) => `<path d="${f.d.join('')}" fill="${f.col}" fill-opacity="${f.op.toFixed(2)}"/>`).join('');
  svg += `<path class="edge" d="${map.clusters.map((c) => c.edge).join('')}" fill="none" stroke="#FBFAF7" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  if (dots) svg += `<path class="edge" d="${dots}" fill="#FFFFFF" stroke="#5B5F66" stroke-width="0.6"/>`;
  svg += `<path class="edge" d="${map.groups.map((g) => g.edge).join('')}" fill="none" stroke="#141413" stroke-width="1.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;

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
  const r0 = S.cr ? map.regions.find((r) => r.id === S.cr) : null;
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

  if (r0) svg += `<path d="${hexD(r0.x, r0.y)}" fill="${map.groups.find((g) => g.id === r0.group).col}" fill-opacity="0.35" stroke="#141413" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
  const gl = map.groups.map((g) => {
    const on = g0 && g0.id === g.id, n = groupHeat[g.id] || 0;
    const ink = on ? '#FFFFFF' : (lit.size && !n ? '#8A8E95' : '#141413');
    return `<button type="button" class="glab" data-group="${esc(g.address)}" style="left:${g.at[0].toFixed(1)}px;top:${(g.box.t - 8).toFixed(1)}px;border-color:${g.col};background:${on ? g.col : (n ? tint(g.col, 0.18) : '#FFFFFF')};color:${ink}">${esc(g.name)}${n ? ' · ' + n : ''}</button>`;
  }).join('');
  const cl = lod !== 'g' ? map.clusters.filter((c) => c.size >= 3 || clusterHeat[c.id]).map((c) => {
    const n = clusterHeat[c.id] || 0;
    return `<div class="clab" style="left:${c.at[0].toFixed(1)}px;top:${c.at[1].toFixed(1)}px;${lit.size && !n ? 'color:#8A8E95;' : ''}">${esc(c.name)}${n ? ' · ' + n : ''}</div>`;
  }).join('') : '';

  const placed = cv.places.filter((p) => p.sections.length).length;
  stage.innerHTML = `<div class="cvp" id="cvp" data-lod="${lod}">` +
    `<div class="cworld${ch && el < mo.td ? ' anim' : ''}" style="--td:${mo ? mo.td : 420}ms;--el:-${el.toFixed(0)}ms;width:${map.W}px;height:${map.H}px;transform:translate(${V.tx}px, ${V.ty}px) scale(${V.z});--iz:${(1 / Math.max(0.45, Math.min(V.z, 1.6))).toFixed(3)}">` +
    `<svg width="${map.W}" height="${map.H}" aria-label="Code regions placed under the plan's boxes">${svg}</svg>${moving}${gl}${cl}</div>` +
    `<div class="codehead"><span class="n">${esc(cv.run.repo.split('/').pop())}</span><span class="m">plan: ${esc(cv.run.canvas)} · at ${esc(String(cv.run.head).slice(0, 12))} · map ${cv.run.id} · ${placed} placed, ${cv.places.length - placed} waiting</span>` +
    (S.tRun ? `<span class="past">An earlier map: made ${esc(ist(cv.run.made_at))}${cv.gone ? ` · ${cv.gone} of its regions are gone since` : ''}</span>` : '') +
    (!S.tRun && S.fresh.size ? `<span class="news">${S.fresh.size} newly placed</span>` : '') + `</div>` + timelineHtml() +
    `<div class="repochips">${chips}<span style="flex:1"></span><span class="muted" style="font-size:12px;margin-right:8px">${links} ${links === 1 ? 'link' : 'links'} shown</span>` +
    `<button type="button" class="zb" data-zoom="fit">Fit</button><button type="button" class="zb" data-zoom="-1" aria-label="Zoom out">−</button><span class="zl">${Math.round(V.z * 100)}%</span><button type="button" class="zb" data-zoom="1" aria-label="Zoom in">+</button></div>` +
    `</div>` + netHtml(cv);
  renderCodePanel(cv, map, Q, lit, groupHeat, clusterHeat, placed);
}

/* ------------------------------------------------------------ the plan in time */

/* A strip along the Code map: one band per phase, with marks for plan
   versions, commits, thoughts and maps (t-25f10ce5fd). A phase or a map
   picked shows that time's map; a plan version shows the plan then. */
function timelineHtml() {
  const T = S.tl[S.repo];
  if (!T || T.loading) return `<div class="tl"><span class="tlnote">Reading the timeline…</span></div>`;
  if (T.failed) return `<div class="tl"><span class="tlnote">No timeline: ${esc(T.failed)}</span></div>`;
  if (!T.phases.length) return '';
  const at = scaleOf(T.phases, T.now), pc = (t) => (at(t) * 100).toFixed(3) + '%';
  const PC = ['#E9E5DA', '#DCE6FA', '#F5DCE8', '#D5EEE8', '#F8E0CF', '#E4DDF7'];
  const bands = T.phases.map((p, i) => {
    const l = at(p.start), r = p.end ? at(p.end) : 1, on = S.tPhase === i;
    return `<button type="button" class="tlband${on ? ' on' : ''}" data-tphase="${i}" title="${esc((p.totem || 'every box on ' + p.canvas) + ' · ' + ist(p.start) + ' → ' + (p.end ? ist(p.end) : 'now'))}" style="left:${(l * 100).toFixed(3)}%;width:${Math.max(0.4, (r - l) * 100).toFixed(3)}%;background:${PC[i % PC.length]}">` +
      `<span>${i + 1}. ${esc(p.totem || 'every box')}</span></button>`;
  }).join('');
  const marks = (list, cls, attr, title) => list.map((x) => `<i class="tlm ${cls}" ${attr ? attr(x) : ''} title="${esc(title(x))}" style="left:${pc(x.at)}"></i>`).join('');
  const versions = T.phases.flatMap((p) => p.versions.map((v) => ({ at: v, totem: p.totem })));
  /* The scrubber (t-eef843abdf): where it rests - the dragged place, the
     moment picked, the earlier map shown, or now. */
  const cur = S.tRun ? T.maps.find((m) => m.id === S.tRun) : null;
  const restAt = S.tDrag ? null : S.tMoment ? S.tMoment.when : cur ? cur.at : T.now;
  const hf = S.tDrag ? S.tDrag.f : at(restAt);
  const tip = S.tDrag ? scrubTip(T, S.tDrag) : (S.tMoment ? 'Plan at ' + ist(S.tMoment.when) : cur ? 'Map ' + cur.id + ' · ' + ist(cur.at) : 'Now');
  return `<div class="tl" data-tl="1">` +
    `<div class="tlbands">${bands}</div>` +
    `<div class="tlrow c">${marks(T.commits, 'mc', null, (c) => c.sha + ' ' + ist(c.at) + '\n' + c.subject)}</div>` +
    `<div class="tlrow t">${marks(T.thoughts, 'mt', null, (t) => t.id + ' ' + (t.kind || '') + ' ' + ist(t.at) + '\n' + t.text)}</div>` +
    `<div class="tlrow v">${marks(versions, 'mv', (v) => `data-tver="${esc(v.at)}"`, (v) => 'Plan version ' + ist(v.at) + ' - click for the plan then')}` +
    `${marks(T.maps, 'mm' + '', (m) => `data-tmap="${m.id}"`, (m) => 'Map ' + m.id + ' · ' + ist(m.at) + ' · ' + m.placed + ' of ' + m.regions + ' placed')}</div>` +
    `<div class="tltrack" id="tltrack"><div class="tlhandle${S.tDrag ? ' dragging' : ''}" id="tlhandle" data-tlhandle="1" style="left:${(hf * 100).toFixed(3)}%" title="Drag through time">` +
    `<span class="knob"></span><span class="tip" id="tltip">${esc(tip)}</span></div></div>` +
    `<div class="tlkey"><span><i class="tlm mv"></i>plan versions</span><span><i class="tlm mm"></i>maps</span><span><i class="tlm mc"></i>commits</span><span><i class="tlm mt"></i>thoughts</span>` +
    (S.tRun || S.tPhase != null ? `<button type="button" class="tlback" data-tnow="1">Back to now</button>` : '') + `</div></div>`;
}

/* ------------------------------------------------------------ scrubbing the timeline */

function scrubTip(T, D) {
  const g = D.target, what = !g ? '' : g.kind === 'map' ? ' · map ' + g.id : g.kind === 'version' ? ' · plan version' : ' · now';
  return ist(timeAt(T.phases, T.now, D.f)) + what;
}

function scrubFrac(e) {
  const tr = $('tltrack');
  if (!tr) return null;
  const r = tr.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
}

/* What the map and the panel show for a snap point: a map is shown itself, a
   plan version with the newest map made before it, now with today's map; the
   maps either side are fetched ahead. */
function scrubApply(T, g) {
  const latest = T.maps[T.maps.length - 1];
  const m = g.kind === 'map' ? T.maps.find((x) => x.id === g.id) : g.kind === 'version' ? mapAtOrBefore(T.maps, g.at) : null;
  S.tRun = g.kind === 'now' || !m || (latest && m.id === latest.id) ? null : m.id;
  S.tPhase = g.kind === 'now' ? null : phaseAt(T.phases, g.at);
  S.tMoment = null; S.cg = null; S.cc = null; S.cr = null; S.net = null;
  const i = m ? T.maps.findIndex((x) => x.id === m.id) : T.maps.length - 1;
  for (const j of [i - 2, i - 1, i + 1, i + 2]) { const x = T.maps[j]; if (x && (!latest || x.id !== latest.id)) ensurePast(x.id); }
}

let scrubFrame = 0;
function scrubMove(f) {
  const D = S.tDrag, T = S.tl[S.repo];
  if (!D || !T) return;
  D.f = f;
  if (scrubFrame) return;
  scrubFrame = requestAnimationFrame(() => {
    scrubFrame = 0;
    const D2 = S.tDrag;
    if (!D2) return;
    /* Every frame: only the handle and its time move. */
    const h = $('tlhandle'), tip = $('tltip');
    const g = nearestTarget(D2.targets, D2.at, D2.f);
    if (h) h.style.left = (D2.f * 100).toFixed(3) + '%';
    const changed = !D2.target || g.at !== D2.target.at || g.kind !== D2.target.kind;
    D2.target = g;
    if (tip) tip.textContent = scrubTip(T, D2);
    /* Only when the snap point changes: the map and the panel - and while
       hexagons are still moving, the next map waits for them, so a fast drag
       does not pile motions on top of each other (t-c4b73fa51a). */
    if (changed) applyWhenStill(T);
  });
}

let stillTimer = 0;
function applyWhenStill(T) {
  const left = S.motion ? S.motion.td - (performance.now() - S.motion.start) : 0;
  clearTimeout(stillTimer); stillTimer = 0;
  const go = () => { stillTimer = 0; const D = S.tDrag; if (D && D.target) { scrubApply(T, D.target); scheduleRender(); } };
  if (left > 16) stillTimer = setTimeout(go, left); else go();
}

document.addEventListener('pointerdown', (e) => {
  if (S.tab !== 'code' || e.button !== 0) return;
  const inTl = e.target.closest && e.target.closest('[data-tl]');
  if (!inTl || e.target.closest('button, [data-tver], [data-tmap]')) return;
  const T = S.tl[S.repo];
  if (!T || !T.phases || !T.phases.length) return;
  e.preventDefault();
  S.tDrag = { f: scrubFrac(e) ?? 1, target: null, targets: snapTargets(T), at: scaleOf(T.phases, T.now) };
  const h = $('tlhandle'); if (h) h.classList.add('dragging');
  scrubMove(S.tDrag.f);
});
document.addEventListener('pointermove', (e) => {
  if (!S.tDrag) return;
  const f = scrubFrac(e);
  if (f != null) scrubMove(f);
});
const scrubEnd = () => {
  const D = S.tDrag;
  if (!D) return;
  S.tDrag = null;
  if (scrubFrame) { cancelAnimationFrame(scrubFrame); scrubFrame = 0; }
  if (stillTimer) { clearTimeout(stillTimer); stillTimer = 0; }
  const T = S.tl[S.repo], g = D.target || (T && nearestTarget(D.targets, D.at, D.f));
  if (T && g) scrubApply(T, g);
  /* Let go on a plan version: the plan then, read from the canvas history. */
  if (g && g.kind === 'version') return pickMoment(g.at);
  render();
};
document.addEventListener('pointerup', scrubEnd);
document.addEventListener('pointercancel', scrubEnd);

/* The panel for a phase, or for the plan at a moment. */
function phasePanel(cv) {
  const T = S.tl[S.repo];
  if (!T || !T.phases) return '';
  if (S.tMoment) {
    const M = S.tMoment, D = M.data;
    if (!D) return `<div class="k">The plan at ${esc(ist(M.when))}</div><p class="muted">${esc(M.failed || 'Reading it from the canvas history…')}</p>`;
    const ch = D.changed, ph = D.phase;
    const list = (title, xs, f) => (xs && xs.length ? `<h3>${title}</h3><div class="why">${xs.map((x) => `<div>${f(x)}</div>`).join('')}</div>` : '');
    return `<div class="k">The plan at ${esc(ist(M.when))}</div><h2>${esc(ph ? ph.totem || 'Every box on ' + ph.canvas : 'No plan yet')}</h2>` +
      `<p class="owner">${D.boxes.length} boxes${D.by ? ' · written by ' + esc(D.by) : ''}${ph ? ' · phase ' + (T.phases.findIndex((p) => p.start === ph.start) + 1) : ''}</p>` +
      (ch ? `<h3>Changed in this version (${esc(ist(ch.at, false))})</h3>` +
        (ch.added.length + ch.removed.length + ch.renamed.length + ch.reworded.length ? '' : '<p class="muted">Nothing in the plan totem\'s boxes changed: another totem did.</p>') +
        list('Added', ch.added, (a) => esc(short(a))) + list('Removed', ch.removed, (a) => esc(short(a))) +
        list('Renamed', ch.renamed, ([a, b]) => esc(short(a)) + ' → ' + esc(short(b))) + list('Reworded', ch.reworded, (a) => esc(short(a))) : '') +
      `<h3>Its boxes then</h3><div class="why">${D.boxes.map((b) => `<div><b>${esc(b.name)}</b><div class="muted" style="white-space:pre-line">${esc(b.words.split('\n').slice(1).join('\n').slice(0, 320))}</div></div>`).join('')}</div>`;
  }
  const i = S.tPhase, p = T.phases[i];
  if (!p) return '';
  const inside = (t) => t >= p.start && (!p.end || t < p.end);
  const commits = T.commits.filter((c) => inside(c.at)), thoughts = T.thoughts.filter((t) => inside(t.at)), maps = T.maps.filter((m) => inside(m.at));
  return `<div class="k">Phase ${i + 1} of ${T.phases.length}</div><h2>${esc(p.totem || 'Every box on ' + p.canvas)}</h2>` +
    `<p class="owner">${esc(ist(p.start))} → ${esc(p.end ? ist(p.end) : 'now')} · ${p.totem ? 'the plan totem on ' + esc(p.canvas) : 'no plan totem named yet: every box counted'}` +
    (p.rebuilt ? '<br><span class="muted">Rebuilt from the maps and the canvas history: the binding then was not kept.</span>' : '') + `</p>` +
    `<div class="stats"><div><b>${p.versions.length}</b><span>plan versions</span></div><div><b>${commits.length}</b><span>commits</span></div><div><b>${thoughts.length}</b><span>thoughts, ${p.settled} settled</span></div></div>` +
    (cv && S.tRun ? `<p class="muted">The map shown is map ${cv.run.id}, the newest made in this phase (${esc(ist(cv.run.made_at))}).</p>` : (maps.length ? '' : '<p class="muted">No map was made in this phase.</p>')) +
    `<h3>Plan versions</h3><div class="rows">${p.versions.map((v) => `<button type="button" class="row" data-tver="${esc(v)}"><span class="nm">${esc(ist(v))}</span><span class="mt">the plan then</span></button>`).join('')}</div>` +
    `<h3>Commits</h3>${commits.map((c) => `<div class="npcommit"><span class="sha">${esc(c.sha)}</span> <span class="muted">${esc(ist(c.at, false))}</span><br>${esc(c.subject)}</div>`).join('') || '<p class="muted">None.</p>'}` +
    `<h3>Thoughts recorded</h3><div class="why">${thoughts.slice(0, 40).map((t) => `<div><span style="color:${KCOL[t.kind] || '#5B5F66'};font-weight:600">${esc(t.kind || '')}</span> ${esc(t.text)} <span class="muted">${esc(t.id)}${t.settled ? ' · settled in ' + esc(t.settled) : ' · waiting'}</span></div>`).join('')}${thoughts.length > 40 ? `<div class="muted">and ${thoughts.length - 40} more</div>` : ''}</div>` +
    `<h3>Maps</h3><div class="rows">${maps.map((m) => `<button type="button" class="row" data-tmap="${m.id}"><span class="nm">Map ${m.id}</span><span class="mt">${esc(ist(m.at, false))} · ${m.placed} of ${m.regions} placed</span></button>`).join('') || '<div class="row plain"><span class="nm muted">None</span></div>'}</div>`;
}

/* Boxes whose code moved on while their words did not (t-e8ed35d743). */
function driftHtml(boxAddress) {
  const T = S.tl[S.repo];
  if (!T || !T.drift || S.tRun) return '';
  const list = T.drift.filter((d) => !boxAddress || d.box === boxAddress);
  if (!list.length) return '';
  return `<h3>Code changed, plan didn't</h3><div class="why">` + list.map((d) => `<div><b>${esc(short(d.box))}</b> <span class="dis">words last changed ${esc(ist(d.words_changed))}</span>` +
    d.commits.map((c) => `<div class="npcommit"><span class="sha">${esc(c.sha)}</span> <span class="muted">${esc(ist(c.at, false))} · made for ${esc(short(c.made_for))}</span><br>${esc(c.subject)}</div>`).join('') + `</div>`).join('') +
    `</div><p class="muted">Its code was changed by commits made for another box after its words last changed: the box may need updating.</p>`;
}

/* ------------------------------------------------------------ a region's thoughts */

/* Asked for once per region; the page redraws when the answer arrives. */
function openNet(rid) {
  S.net = rid; S.netSel = null;
  if (S.netData && S.netData.region.id === rid) return render();
  S.netData = null; S.netFailed = '';
  render();
  getJson('/api/region-thoughts?repo=' + encodeURIComponent(S.repo) + '&region=' + encodeURIComponent(rid))
    .then((j) => { if (S.net === rid) S.netData = j; })
    .catch((e) => { if (S.net === rid) S.netFailed = e.message; })
    .then(() => { if (S.tab === 'code') render(); });
}

/* The region as a square among its thoughts, as the prototype drew it
   (t-b2c1b5bfcc): solid lines to what its code cites, thin grey lines to
   what was recorded on its commits, GitX's links between thoughts, history
   faded; a thought picked is read in full in the side panel. */
function netHtml(cv) {
  if (!S.net) return '';
  const R = cv.regions[S.net] || {};
  const head = (sub) => `<div class="nethead"><span class="t">${esc(R.name || S.net)}</span><span class="m">${esc(sub)}</span></div>`;
  const shell = (inner, side) => `<div class="netov" role="dialog" aria-label="Thoughts of ${esc(R.name || '')}"><div class="netcanvas" id="netcanvas">${inner}</div>` +
    `<aside class="netside"><div style="display:flex;justify-content:flex-end"><button type="button" class="bback light" data-netclose="1">Close</button></div>${side}</aside></div>`;
  const N = S.netData;
  if (!N || N.region.id !== S.net) return shell(head(S.netFailed || 'Reading its thoughts from GitX…'), '');
  const { w, h } = stageSize(), W = Math.max(420, w - 48 - 360), H = Math.max(320, h - 74 - 70);
  const pos = S.netPos && S.netPos.key === S.net + '|' + W + '|' + H ? S.netPos.pos : (S.netPos = { key: S.net + '|' + W + '|' + H, pos: layoutNet(N.order, N.edges, W, H) }).pos;
  const cur = N.order.filter((id) => N.thoughts[id].current).length;
  let svg = '';
  for (const e of N.edges) {
    const a = pos[e.a], b = pos[e.b];
    if (!a || !b) continue;
    const s = edgeStyle(e.kind);
    svg += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${s.col}" stroke-width="${s.sw}" opacity="${s.op}"/>`;
  }
  const label = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  let nodes = `<button type="button" class="netnode" data-netsel="" title="${esc(R.file + '::' + R.name)}" style="left:${pos['#'].x - 9}px;top:${pos['#'].y - 9}px">` +
    `<span class="mk" style="width:18px;height:18px;border-radius:4px;background:#141413;border:2px solid #141413"></span><span class="lb">${esc(label(R.name || '', 46))}</span></button>`;
  for (const id of N.order) {
    const t = N.thoughts[id], col = KCOL[t.kind] || '#5B5F66', p = pos[id], on = S.netSel === id;
    nodes += `<button type="button" class="netnode" data-netsel="${esc(id)}" title="${esc(id + ' · ' + (t.kind || '') + '\n' + t.text)}" style="left:${(p.x - 7).toFixed(1)}px;top:${(p.y - 7).toFixed(1)}px;opacity:${t.current ? 1 : 0.5}">` +
      `<span class="mk" style="width:14px;height:14px;border-radius:50%;background:${t.current ? col : '#FFFFFF'};border:2px solid ${col};${on ? 'box-shadow:0 0 0 4px rgba(20, 20, 19, 0.25)' : ''}"></span><span class="lb">${esc(label(t.text, 54))}</span></button>`;
  }
  const inner = head(`${cv.run.repo.split('/').pop()} · ${R.file} · ${R.lines[1] - R.lines[0] + 1} lines · ${N.order.length} thoughts, ${cur} current`) +
    `<svg class="netedges" width="${W}" height="${H}" aria-hidden="true">${svg}</svg>${nodes}`;
  let picked = '';
  const t = S.netSel && N.thoughts[S.netSel];
  if (t) {
    const why = t.role === 'cited' ? 'Cited by this region\'s code today.' : t.role === 'commit' ? 'Recorded on a commit whose lines are in this region.' : 'Linked to a thought this region\'s code cites.';
    const meta = [why, t.outcome ? 'Outcome: ' + t.outcome + (t.graph === 'waiting' ? ', waiting to be settled' : '') : '',
      t.recorded_on ? `Recorded at ${t.recorded} (${t.recorded_on[0]}): ${t.recorded_on[1]}` : '',
      t.settled_in ? `Settled in ${t.settled} (${t.settled_in[0]}): ${t.settled_in[1]}` : '',
      t.links.length ? 'Links: ' + t.links.map(([k, to]) => k + ' ' + to).join(', ') : ''].filter(Boolean);
    picked = `<div class="nphead" style="color:${KCOL[t.kind] || '#5B5F66'}">${esc(S.netSel)} · ${esc(t.kind || '')} · ${t.current ? 'current' : 'history'}</div>` +
      `<p class="nptext">${esc(t.text)}</p><div class="npmeta">${esc(meta.join('\n'))}</div><div class="npsep"></div>`;
  }
  const map = mapOf(cv), r = map.regions.find((x) => x.id === S.net);
  const cl = r ? map.clusters[r.cl] : null, g = r ? map.groups.find((x) => x.id === r.group) : null;
  const side = picked + `<div class="k">This code region</div><p class="npmeta">${esc(R.file)}${cl ? '\nIn: ' + esc(cl.name) + (g && !g.wait ? ' (under ' + esc(g.name) + ')' : ' (not yet placed)') : ''}</p>` +
    `<div class="k">Commits whose lines are in it today</div>` +
    N.commits.map((c) => `<div class="npcommit"><span class="sha">${esc(c.sha)}</span> <span class="muted">${esc(c.date)}</span><br>${esc(c.subject)}</div>`).join('') +
    `<div class="k">Reading it</div><p class="npmeta">The square is the code region. A solid line means its code cites the thought today. A thin grey line leads to a thought recorded on one of its commits. The other lines are the links between thoughts that GitX recorded. Faded thoughts are history: no code cites them now. Colours: decision blue, finding green, cost orange, lesson purple.</p>`;
  return shell(inner, side);
}

function renderCodePanel(cv, map, Q, lit, groupHeat, clusterHeat, placed) {
  const P = $('panel');
  const crumbsHtml = () => {
    const parts = [['Code map', 'code', !S.cg && S.cc == null]];
    const g0 = S.cg != null ? map.groups.find((g) => g.address === S.cg) : (S.cc != null ? map.groups.find((g) => g.id === map.clusters[S.cc].group) : null);
    if (g0) parts.push([g0.name, 'g:' + g0.address, S.cc == null]);
    const rr = S.cr ? map.regions.find((r) => r.id === S.cr) : null;
    if (S.cc != null) parts.push([map.clusters[S.cc].name, rr ? 'c:' + S.cc : '', !rr]);
    if (rr) parts.push([rr.name.length > 28 ? rr.name.slice(0, 26) + '…' : rr.name, '', true]);
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

  /* A phase or a moment picked on the timeline (t-25f10ce5fd). */
  if (S.tMoment || (S.tPhase != null && S.cc == null && S.cg == null && !S.cr)) { P.innerHTML = phasePanel(cv); return; }
  /* A code region: where it is, what it is in, the commits whose lines are in
     it, and the button to its thoughts (t-b2c1b5bfcc). */
  const r0 = S.cr ? map.regions.find((r) => r.id === S.cr) : null;
  if (r0 && cv.regions[r0.id]) {
    const R = cv.regions[r0.id], c = map.clusters[r0.cl], g = map.groups.find((x) => x.id === r0.group);
    const lines = R.lines[1] - R.lines[0] + 1;
    const commits = R.commits.slice(0, 12).map((sha) => { const x = cv.commits[sha] || ['', '']; return `<div class="npcommit"><span class="sha">${esc(sha.slice(0, 7))}</span> <span class="muted">${esc(x[0])}</span><br>${esc(commitText(cv, sha).split('\n')[0])}</div>`; }).join('');
    P.innerHTML = crumbsHtml() + `<div class="k">Code region</div><h2 class="mono" style="font-size:18px;line-height:1.35">${esc(R.name)}</h2>` +
      `<p class="owner">${esc(cv.run.repo.split('/').pop())} · ${esc(R.file)}<br>${lines} lines${r0.fresh ? ' · newest line ' + esc(r0.fresh) : ''}<br>In: ${esc(c.name)}${g.wait ? ' · not yet placed' : ' · under ' + esc(g.name)}` +
      (r0.also.length ? '<br>Also serves: ' + r0.also.map((s) => esc(short(s))).join(', ') : '') + `</p>` +
      `<button type="button" class="netbtn" data-net="${esc(r0.id)}">${R.cites ? `Its thoughts: ${R.cites} cited by its code, and the ones around them` : 'Its thoughts: those recorded on its commits'}</button>` +
      `<h3>Commits whose lines are in it today</h3>${commits || '<p class="muted">None found.</p>'}`;
    return;
  }
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
      trafficBox + driftHtml(g0.address) + (words ? `<h3>The plan box says</h3><p>${esc(words.split('\n').slice(1).join('\n') || words)}</p>` : '') +
      `<h3>Its clusters</h3><div class="rows">${g0.clusters.slice().sort((a, b) => map.clusters[b].size - map.clusters[a].size).map((id) => clusterRow(map.clusters[id])).join('')}</div>`;
    return;
  }
  const reached = new Set(cv.places.flatMap((p) => p.sections));
  const noCode = cv.run.sections.filter((s) => !reached.has(s));
  P.innerHTML = crumbsHtml() + `<div class="k">Code map</div><h2>${esc(cv.run.repo.split('/').pop())}</h2>` +
    `<p>Each hexagon is one code region at ${esc(cv.run.head)}, under the plan box it does, judged by its commits and decisions. Inside a box, regions of one line of work - one commit scope - form a cluster. A region doing two boxes' work sits on the border between them (white dot). Zoom in for clusters; click to open a box or a cluster.</p>` +
    `<div class="legendgrid"><span><span class="sw-hex hexclip" style="background:#2F5BD3"></span>Placed under a plan box</span><span><span class="sw-hex hexclip" style="background:#8A8E95;opacity:.5"></span>Not yet placed</span><span><span class="sw-hex hexclip" style="background:#2F5BD3;opacity:.45"></span>Fainter: older code</span><span><span class="dotw"></span>Serves two boxes</span></div>` +
    `<div class="stats"><div><b>${placed}</b><span>placed</span></div><div><b>${cv.places.length - placed}</b><span>waiting</span></div><div><b>${noCode.length}</b><span>boxes with no code yet</span></div></div>` +
    trafficBox + driftHtml() + `<h3>Plan boxes</h3><div class="rows">` +
    map.groups.map((g) => `<button type="button" class="row" data-group="${esc(g.address)}"><span class="sw hexclip" style="background:${g.col};opacity:${g.wait ? 0.5 : 1}"></span><span class="nm">${esc(g.name)}</span><span class="mt">${g.clusters.length} · ${g.size}</span></button>`).join('') +
    noCode.map((s) => `<div class="row plain"><span class="sw hexclip" style="background:#E6E2D8"></span><span class="nm">${esc(short(s))}</span><span class="mt">no code yet</span></div>`).join('') + `</div>`;
}

/* Pan and zoom on the code map; a click (not a drag) opens what is under it. */
let drag = null;
function codePointerDown(e) {
  const vp = e.target.closest('#cvp');
  if (!vp || e.button !== 0 || e.target.closest('button, [data-tl]')) return;
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
  const cv = curCode(), vp = $('cvp');
  if (!cv || !vp) return;
  const rect = vp.getBoundingClientRect(), map = mapOf(cv);
  const r = regionAt(map, (e.clientX - rect.left - S.cview.tx) / S.cview.z, (e.clientY - rect.top - S.cview.ty) / S.cview.z);
  if (!r) { S.cg = null; S.cc = null; return render(); }
  /* Zoomed in to regions, or clicking inside the cluster already open: the region itself. */
  if (lodOf(S.cview.z) === 'g') { S.cg = map.groups.find((g) => g.id === r.group).address; S.cc = null; S.cr = null; }
  else if (lodOf(S.cview.z) === 'r' || S.cc === r.cl) { S.cr = r.id; S.cc = r.cl; S.cg = null; }
  else { S.cc = r.cl; S.cg = null; S.cr = null; }
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
  $('panel').hidden = S.tab === 'canvas' || (S.tab === 'code' && !!S.net);
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
  if (!vp || e.button !== 0 || e.target.closest('button, [data-pic]') || !S.bview) return;
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

/* A picture opened large over the page, as the prototype did; a click or Esc closes it. */
function openPic(src, name) {
  closePic();
  const lb = document.createElement('div');
  lb.className = 'lightbox'; lb.id = 'lightbox';
  lb.innerHTML = `<figure><img src="${esc(src)}" alt="${esc(name)}"><figcaption>${esc(name)}</figcaption></figure>`;
  document.body.appendChild(lb);
}
function closePic() { const lb = $('lightbox'); if (lb) { lb.remove(); return true; } return false; }

document.addEventListener('click', (e) => {
  if (e.target.closest('#lightbox')) return closePic();
  const pic = e.target.closest('[data-pic]');
  if (pic) return openPic(pic.dataset.pic, pic.dataset.picname);
  const t = e.target.closest('button, polygon, [data-tver], [data-tmap]');
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
  if (d.net) return openNet(d.net);
  if (d.netclose) { S.net = null; S.netSel = null; return render(); }
  if (d.netsel !== undefined) { S.netSel = d.netsel || null; return render(); }
  if (d.tphase !== undefined) {
    const T = S.tl[S.repo], i = +d.tphase, p = T && T.phases[i];
    if (!p) return;
    const m = lastMapIn(T.maps, p.start, p.end), latest = T.maps[T.maps.length - 1];
    S.tPhase = i; S.tMoment = null; S.cg = null; S.cc = null; S.cr = null; S.net = null;
    S.tRun = m && (!latest || m.id !== latest.id) ? m.id : null; S.cview = null;
    return render();
  }
  if (d.tmap) {
    const T = S.tl[S.repo], id = +d.tmap, latest = T && T.maps[T.maps.length - 1], m = T && T.maps.find((x) => x.id === id);
    S.tRun = latest && latest.id === id ? null : id; S.tMoment = null; S.cg = null; S.cc = null; S.cr = null; S.net = null; S.cview = null;
    if (m && T) S.tPhase = phaseAt(T.phases, m.at);
    return render();
  }
  if (d.tver) { const T = S.tl[S.repo]; if (T) S.tPhase = phaseAt(T.phases, d.tver); S.cg = null; S.cc = null; S.cr = null; return pickMoment(d.tver); }
  if (d.tnow) { S.tRun = null; S.tPhase = null; S.tMoment = null; S.cview = null; return render(); }
  if (d.repo) { S.repo = d.repo; S.cg = null; S.cc = null; S.cr = null; S.net = null; S.tRun = null; S.tPhase = null; S.tMoment = null; S.fresh = new Set(); try { localStorage.setItem('automatu.repo', d.repo); } catch (_) {} loadCode(); return render(); }
  if (d.group !== undefined) { S.cg = S.cg === d.group ? null : d.group; S.cc = null; S.cr = null; return render(); }
  if (d.cluster !== undefined) { S.cc = +d.cluster; S.cg = null; S.cr = null; return render(); }
  if (d.pcrumb !== undefined) {
    if (d.pcrumb === 'code') { S.cg = null; S.cc = null; } else if (d.pcrumb.startsWith('g:')) { S.cg = d.pcrumb.slice(2); S.cc = null; } else if (d.pcrumb.startsWith('c:')) S.cc = +d.pcrumb.slice(2);
    S.cr = null; return render();
  }
  if (d.zoom) {
    if (d.zoom === 'fit') { const cv = curCode(); if (cv) S.cview = { repo: S.repo, ...fitView(mapOf(cv)) }; return render(); }
    const { w, h } = stageSize(); return zoomAt(w / 2, h / 2, S.cview.z * (d.zoom === '1' ? 1.25 : 0.8));
  }
});

let typing = null;
$('term').addEventListener('input', (e) => { clearTimeout(typing); typing = setTimeout(() => { S.query = e.target.value; S.off = {}; render(); }, 180); });

document.addEventListener('pointermove', (e) => {
  const vp = e.target.closest && e.target.closest('#cvp'), tip = $('tip'), cv = S.tab === 'code' ? curCode() : null;
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
  if (closePic()) return;
  if (S.tab === 'code' && S.net) { S.net = null; S.netSel = null; render(); return; }
  if (S.tab === 'code' && S.cr) { S.cr = null; render(); return; }
  if (S.tab === 'code' && S.tMoment) { S.tMoment = null; render(); return; }
  if (S.tab === 'code' && (S.tPhase != null || S.tRun)) { S.tPhase = null; S.tRun = null; S.cview = null; render(); return; }
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
    if (S.pendingRegion) {
      const r = mapOf(S.code[S.repo]).regions.find((x) => x.id === S.pendingRegion);
      if (r) { S.cr = r.id; S.cc = r.cl; S.cg = null; if (S.pendingNet) openNet(r.id); }
      S.pendingRegion = null; S.pendingNet = false;
    }
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
  if (u.get('region')) { S.pendingRegion = u.get('region'); S.pendingNet = u.get('net') === '1'; }
  if (u.get('phase')) S.pendingPhase = +u.get('phase');
  if (u.get('moment')) S.pendingMoment = u.get('moment');
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
    if (r.repo === S.repo) loadTimeline(true);
  }
  render();
}

start();
