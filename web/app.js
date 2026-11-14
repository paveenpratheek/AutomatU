/*
 * The AutomatU map view, with the SearchX prototype's look and layout
 * (t-87c7947c95), rebuilt as plain modules (t-9df524dad9).
 *
 * Main: the canvases the user added (box 24) as hexagons - click in from canvas
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
import { liveCommits, regionsOf, regionLabel, sinceLine, closedLine } from './notices.js';
import { desksHtml, deskEvents, eventsHtml, runViewHtml } from './desks.js';
import { canvasListHtml } from './canvaslist.js';
import { AGENT_NAMES, agentsBoxHtml, agentsHtml as deskAgentHtml } from './agents.js';
import { SECTIONS, HEADS, TONES, DEEP, addFlowStep, askHtml, askText, formBody, kdBarHtml, kdDesksHtml, kdTrackingHtml, kfHtml, mergeOverview, monitoringHtml, moveFlowStep,
  removeFlowStep, setFlowField, starterFlow, trackMark, trackedOn } from './kd.js';
import { addStep, editorHtml, moveStep, normal, removeStep, setPlaced, toSave } from './workflows.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (address) => String(address).split(' > ').pop();

/* Canvases are white hexagons; totems and their boxes take a soft tone each.
   A selected hexagon is ringed in clay - the one warm colour outside the tones. */
const CANVAS = { ring: '#DEDEDE', strong: '#F2F2F2', fill: '#F6F6F6', soft: '#FFFFFF', ink: '#1F1E1D', swatch: '#C9C9C9', glow: 'rgba(242, 242, 242, 0.9)' };
const SELECT = { ring: '#C6613F', fill: 'linear-gradient(180deg, #FFFFFF 0%, #FBEFE9 100%)' };
const chan = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${chan(hex).join(', ')}, ${a})`;
const mix = (hex, k) => 'rgb(' + chan(hex).map((v) => Math.round(255 + (v - 255) * k)).join(', ') + ')';   // k of the colour, the rest white
const PALS = TONES.slice(0, 6).map((t, i) => ({ ring: rgba(DEEP[i], 0.5), strong: t, fill: mix(t, 0.6), soft: mix(t, 0.2), ink: '#1F1E1D', swatch: DEEP[i], glow: rgba(t, 0.45) }));
/* Plan boxes on the code map: the same soft tones. */
const BOXCOLS = TONES;
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
  notices: null, agents: null, drop: null, noticesFailed: '',
  canvasList: null, canvasBusy: '', canvasSaid: '', canvasFailed: '',
  kdSec: 'ask', kd: null, ask: { q: '', only: true }, kdForm: null, kdSaid: '', kf: null, kdMon: null,
};

/* The Knowledge Desk tab and its sections (box 25): Agents and Workflows live inside it. */
const inKd = (sec) => S.tab === 'kd' && S.kdSec === sec;

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
  /* The Tracking layer (t-799e6f44c2): boxes a desk tracks, from Knowledge Desk. */
  if (!S.track || S.track.m !== S.m) S.track = { m: S.m, on: trackedOn(reg, (S.kd && S.kd.tracking) || []) };
  const cellFor = (id, at, W, H, o) => {
    const x = reg[id], p = palOf(reg, id), hh = heat(id), sel = S.sel === id;
    const tk = S.track.on.size ? trackMark(id, id === 'root' ? [] : boxesUnder(reg, id), S.track.on) : null;
    const nm = x.name, lenDiv = nm.length > 26 ? 11 : (nm.length > 14 ? 9 : 7);
    const fs = Math.max(10, Math.min(o.maxFs, W / lenDiv));
    const fill = sel ? SELECT.fill : o.kind === 'canvas' ? 'linear-gradient(180deg, #FFFFFF 0%, #F2F2F2 100%)' : o.kind === 'totem' ? grad(p.fill, p.strong) : o.leaf ? grad('#FFFFFF', p.soft) : grad(p.soft, p.fill);
    return { id, l: at[0] - W / 2, t: at[1] - H / 2, w: W, h: H, fs, subFs: Math.max(9, Math.min(13, fs - 3)), weight: 600,
      title: nm, sub: o.sub, line: sel ? SELECT.ring : p.ring, inset: sel ? 2.5 : 1, fill, ink: p.ink, op: 1, hits: hh, arr: hh ? heatArr(id) : null, sel, pf: p.fill,
      kws: [], heat: '', act: o.leaf ? 'read' : 'open', aria: (o.leaf ? 'Read ' : 'Open ') + nm, at, tk };
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
    (focused ? `<div class="hexclip" aria-hidden="true" style="position:absolute;left:${w / 2 - BW / 2}px;top:${80 + (h - 90 - BH) / 2}px;width:${BW}px;height:${BH}px;background:radial-gradient(closest-side, ${bp.glow} 0%, rgba(255, 255, 255, 0) 100%)"></div>` +
      `<svg class="ghost" aria-hidden="true" width="${BW}" height="${BH}" style="left:${w / 2 - BW / 2}px;top:${80 + (h - 90 - BH) / 2}px"><polygon points="${hexPts(BW, BH)}" fill="none" stroke="${bp.ring.replace(/0\.\d+\)$/, '0.16)')}"></polygon></svg>` : '') +
    ghosts.map((g) => `<svg class="ghost" aria-hidden="true" width="${g.w}" height="${g.h}" style="left:${g.l}px;top:${g.t}px"><polygon points="${pts}" fill="none" stroke="${g.line}" stroke-opacity="0.4"></polygon></svg>`).join('') +
    cells.map((c) => `<div class="cell hexclip" style="left:${c.l}px;top:${c.t}px;width:${c.w}px;height:${c.h}px;opacity:${c.op};background:${c.tk && c.tk.own && !c.sel ? (c.tk.moved ? '#C6613F' : '#E3A48C') : c.line}">` +
      `<button type="button" class="hx hexclip" data-act="${c.act}" data-id="${c.id}" data-x="${c.at[0]}" data-y="${c.at[1]}" aria-label="${esc(c.aria)}" style="inset:${c.inset}px;background:${c.fill};color:${c.ink}">` +
      `<span class="t" style="font-size:${c.fs}px;font-weight:${c.weight}">${esc(c.title)}</span><span class="s" style="font-size:${c.subFs}px">${esc(c.sub)}</span>` +
      (c.tk ? `<span class="trk-mark${c.tk.moved ? ' moved' : ''}">${esc(c.tk.label)}</span>` : '') +
      (c.kws.length ? `<span class="heat">${c.kws.map((k) => `<i><b style="background:${k.col}"></b>${k.n}</i>`).join('')}${c.heat ? `<span>${c.heat}</span>` : ''}</span>` : '') +
      `</button></div>`).join('') +
    /* The Agents button (box 30): on each canvas that plans a project or is a
       desk's Main canvas; a green dot while an agent is at the desk. */
    (view === 'root' ? cells.map((c) => {
      const name = reg[c.id].name, desk = deskOf(name);
      return (reg[c.id].repos || []).length || desk ? agentsBoxHtml(c, name, desk ? desk.sitting : [], desk ? desk.name : '', placedOn(name)) : '';
    }).join('') : '') +
    `</div>` +
    `<div class="legend">` + [['#E4E4E4', 'Canvas'], [TONES[0], 'Totem'], [mix(TONES[0], 0.4), 'Sub-totem or box: open'], ['#FFFFFF', 'Box with content: read'], ['#C6613F', 'Selected'], ['#E3A48C', 'Tracked by a desk']]
      .map(([c, t]) => `<span><span class="sw hexclip" style="background:${c};box-shadow:inset 0 0 0 1px rgba(31,30,29,0.12)"></span>${t}</span>`).join('') + `</div>`;

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
    const rows = rowIds.map((id) => { const i = dominant(Q.kw, Q.on, heatArr(id)); return { name: reg[id].name, n: heat(id), col: i >= 0 ? Q.kw[i].col : '#C6613F' }; }).sort((a, b) => b.n - a.n);
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
    (view === 'root' ? '<p>Each canvas you added is a hexagon - add or remove one with Canvases, at the top. Inside, each totem sits with its sub-totems around it: related ones touch, unrelated ones keep one hexagon of space, and different topics sit one hexagon apart.</p>' : (node.text ? `<p>${esc(node.text)}</p>` : '')) +
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
  svg += `<path class="edge" d="${map.clusters.map((c) => c.edge).join('')}" fill="none" stroke="#FFFFFF" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  if (dots) svg += `<path class="edge" d="${dots}" fill="#FFFFFF" stroke="#5E5D59" stroke-width="0.6"/>`;
  svg += `<path class="edge" d="${map.groups.map((g) => g.edge).join('')}" fill="none" stroke="#B0AEA5" stroke-width="1.1" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;

  /* Traffic: the rest steps back; each lit region takes its strongest
     keyword's colour at one of five strengths (log scale). */
  const hits = Q.terms.length ? codeHits(cv, Q.kw) : null, lit = new Map();
  let max = 0;
  if (hits) for (const [rid, per] of hits) { const s = traffic(Q.on, per); if (s) { lit.set(rid, { s, dom: dominant(Q.kw, Q.on, per) }); max = Math.max(max, s); } }
  const groupHeat = {}, clusterHeat = {};
  if (lit.size) {
    svg += `<path d="M-40 -40H${map.W + 40}V${map.H + 40}H-40Z" fill="#FCFCFC" fill-opacity="0.72"/>`;
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
  if (fresh.length) svg += `<path class="freshpath" d="${fresh.map((r) => hexD(r.x, r.y)).join('')}" fill="none" stroke="#1F1E1D" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  /* Selection: a box's outline, or a cluster's dashed outline with dotted lines to the clusters it shares code with. */
  const g0 = S.cg != null ? map.groups.find((g) => g.address === S.cg) : null, c0 = S.cc != null ? map.clusters[S.cc] : null;
  if (g0) svg += `<path d="${g0.edge}" fill="none" stroke="#1F1E1D" stroke-width="3.5" vector-effect="non-scaling-stroke"/>`;
  const r0 = S.cr ? map.regions.find((r) => r.id === S.cr) : null;
  let links = 0;
  if (c0) {
    svg += `<path d="${c0.edge}" fill="none" stroke="#1F1E1D" stroke-width="2.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
    const lk = c0.links.map(([o]) => { const x = map.clusters[o]; return `M${c0.at[0]} ${c0.at[1]}L${x.at[0]} ${x.at[1]}`; }).join('');
    links = c0.links.length;
    if (lk) svg += `<path d="${lk}" fill="none" stroke="#1F1E1D" stroke-width="1.5" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>`;
  } else if (g0) {
    const lk = [];
    for (const id of g0.clusters) for (const [o] of map.clusters[id].links) if (map.clusters[o].group !== g0.id) lk.push(`M${map.clusters[id].at[0]} ${map.clusters[id].at[1]}L${map.clusters[o].at[0]} ${map.clusters[o].at[1]}`);
    links = lk.length;
    if (lk.length) svg += `<path d="${lk.join('')}" fill="none" stroke="#1F1E1D" stroke-width="1.5" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>`;
  }

  if (r0) svg += `<path d="${hexD(r0.x, r0.y)}" fill="${map.groups.find((g) => g.id === r0.group).col}" fill-opacity="0.35" stroke="#1F1E1D" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
  const gl = map.groups.map((g) => {
    const on = g0 && g0.id === g.id, n = groupHeat[g.id] || 0;
    const ink = on ? '#FFFFFF' : (lit.size && !n ? '#9B9A95' : '#1F1E1D');
    return `<button type="button" class="glab" data-group="${esc(g.address)}" style="left:${g.at[0].toFixed(1)}px;top:${(g.box.t - 8).toFixed(1)}px;border-color:${on ? '#1F1E1D' : '#E4E4E4'};background:${on ? '#1F1E1D' : (n ? g.col : 'rgba(255, 255, 255, 0.93)')};color:${ink}">${esc(g.name)}${n ? ' · ' + n : ''}</button>`;
  }).join('');
  const cl = lod !== 'g' ? map.clusters.filter((c) => c.size >= 3 || clusterHeat[c.id]).map((c) => {
    const n = clusterHeat[c.id] || 0;
    return `<div class="clab" style="left:${c.at[0].toFixed(1)}px;top:${c.at[1].toFixed(1)}px;${lit.size && !n ? 'color:#9B9A95;' : ''}">${esc(c.name)}${n ? ' · ' + n : ''}</div>`;
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

/* A box the code has moved past, or with work in progress, as its notice
   holds it (t-5f4103c65a, t-b620bd3f41). */
function driftHtml(boxAddress) {
  const T = S.tl[S.repo];
  if (!T || !T.drift || S.tRun) return '';
  const list = T.drift.filter((d) => !boxAddress || d.box === boxAddress);
  if (!list.length) return '';
  return `<h3>The code moved past the plan</h3><div class="why">` + list.map((d) => `<div><b>${esc(short(d.box))}</b> <span class="dis">notice ${d.id}${d.behind ? '' : ' · work in progress'}</span>` +
    d.commits.map((c) => `<div class="npcommit${c.state === 'progress' ? ' muted' : ''}"><span class="sha">${esc(c.sha.slice(0, 7))}</span> <span class="muted">${esc(ist(c.at, false))} · ${c.state === 'progress' ? 'in progress' : 'behind'}</span><br>${esc(c.subject)}</div>`).join('') + `</div>`).join('') +
    `</div><p class="muted">Its code changed after the box was built and its words did not: the box may need updating. Ask an agent to check it and close the notice.</p>`;
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
    `<span class="mk" style="width:18px;height:18px;border-radius:4px;background:#1F1E1D;border:2px solid #1F1E1D"></span><span class="lb">${esc(label(R.name || '', 46))}</span></button>`;
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
    `<div class="legendgrid"><span><span class="sw-hex hexclip" style="background:#B9D2EA"></span>Placed under a plan box</span><span><span class="sw-hex hexclip" style="background:#C9C9C9;opacity:.5"></span>Not yet placed</span><span><span class="sw-hex hexclip" style="background:#B9D2EA;opacity:.45"></span>Fainter: older code</span><span><span class="dotw"></span>Serves two boxes</span></div>` +
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

const ICONS = {
  main: '<path d="M4.5 2h7L15 8l-3.5 6h-7L1 8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  code: '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  canvas: '<rect x="2" y="2.5" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 6h12M6 6v7.5" stroke="currentColor" stroke-width="1.3"/>',
  kd: '<path d="M2 12.5h12M3.5 12.5V7h9v5.5M6 7V4.5h4V7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
};
const icon = (k) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${ICONS[k]}</svg>`;
const setHtml = (el, html) => { if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; } };

/* Under the views, the list that goes with the one open: the canvases you
   added, the repositories with a code map, or the questions you asked. */
function sideListHtml() {
  if (S.tab === 'code') {
    return `<span class="sl-h">Repositories</span>` + (S.repos.length ? S.repos.map((r) => {
      const cv = S.code[r.repo], n = cv ? cv.places.length : '';
      return `<button type="button" class="sl-row${r.repo === S.repo ? ' on' : ''}" data-repo="${esc(r.repo)}" title="${esc(r.repo)}"><span class="nm">${esc(r.repo.split('/').pop())}</span><span class="n">${n}</span></button>`;
    }).join('') : '<span class="sl-empty">No map made yet.</span>');
  }
  if (S.tab === 'kd') {
    const hist = askHistory();
    return `<span class="sl-h">Recent questions</span>` + (hist.length ? hist.map((h, i) =>
      `<button type="button" class="sl-row${S.kdSec === 'ask' && S.ask && S.ask.q === h.q ? ' on' : ''}" data-ask-again="${i}" title="${esc(h.q)}"><span class="nm">${esc(h.q)}</span></button>`).join('')
      : '<span class="sl-empty">The questions you ask show here.</span>');
  }
  const on = S.tab === 'canvas' ? S.bcanvas : S.path[1];
  return `<span class="sl-h">Canvases</span>` + (S.m ? S.m.reg.root.children.map((id) => {
    const x = S.m.reg[id];
    return `<button type="button" class="sl-row${id === on ? ' on' : ''}" data-sl-canvas="${id}"><span class="nm">${esc(x.name)}</span><span class="n">${x.children.length} totem${x.children.length === 1 ? '' : 's'}</span></button>`;
  }).join('') : '') +
    `<button type="button" id="canvasesbtn" class="sl-add${S.drop === 'canvases' ? ' on' : ''}" data-drop="canvases" aria-expanded="${S.drop === 'canvases'}" aria-controls="drop" title="Add a canvas from NoteX, or take one out">` +
    `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Add from NoteX</button>`;
}

function renderChrome() {
  const Q = search();
  document.querySelector('.app').dataset.tab = S.tab;
  $('term').closest('.field').classList.toggle('on', !!S.query.trim());
  setHtml($('chips'), CHIPS.map((c) => `<button type="button" class="pill${S.query.trim().toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-chip="${esc(c)}">${esc(c)}</button>`).join(''));
  const target = S.m ? boardTarget() : null;
  setHtml($('tabs'), [['Main', 'main', 'The hexagon map: find things'], ['Code', 'code', 'The code map: the plan and its code'],
    ['Canvas', 'canvas', target ? 'Open the ' + S.m.reg[target].name + ' canvas, as CanvasX shows it' : 'Pick a canvas on the map first'],
    ['Knowledge Desk', 'kd', 'Ask about your projects, and the junction to Work Desks: the desks, their flows, what they track, and monitoring']].map(([l, k, why]) =>
    `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${S.tab === k}" title="${esc(why)}"${k === 'canvas' && !target ? ' disabled' : ''}>${icon(k)}${l}</button>`).join(''));
  setHtml($('sidelist'), sideListHtml());
  const up = $('kdup');
  up.hidden = S.tab !== 'kd' || !S.kd;
  if (!up.hidden) {
    up.classList.toggle('down', !S.kd.up);
    up.classList.toggle('slow', !!(S.kd.up && S.kd.late));
    setHtml(up, `<span class="dot"></span><span class="tx"><span>${S.kd.up ? (S.kd.late ? 'Knowledge Desk is slow to answer' : 'Knowledge Desk is up') : 'Knowledge Desk is not answering'}</span>` +
      `<span class="m">${esc(S.kd.up ? String(S.kd.url || '').replace(/^https?:\/\//, '') + ' · A2A 1.0' : (S.kd.note || ''))}</span></span>`);
  }
  let crumbs, title;
  if (S.tab === 'main' && S.m) {
    const ids = S.path.filter((id) => S.m.reg[id]);
    crumbs = ids.slice(0, -1).map((id, i) => ({ name: id === 'root' ? 'All canvases' : S.m.reg[id].name, go: 'path:' + i }));
    const last = S.m.reg[ids[ids.length - 1]];
    if (ids.length === 1) { crumbs = [{ name: 'All canvases', go: '' }]; title = 'What are you looking for?'; }
    else { crumbs.push({ name: viewKind(S.m.reg, last), go: '' }); title = last.name; }
  } else if (S.tab === 'canvas' && S.m && S.bcanvas) { crumbs = [{ name: 'All canvases', go: 'path:0' }, { name: 'Open canvas', go: '' }]; title = S.m.reg[S.bcanvas].name; }
  else if (S.tab === 'kd') { crumbs = [{ name: 'Knowledge Desk', go: '' }]; title = HEADS[S.kdSec] || 'Knowledge Desk'; }
  else {
    const cv = S.repo && (S.tRun ? curCode() : S.code[S.repo]);
    crumbs = [{ name: S.repo ? S.repo.split('/').pop() + (cv ? ` · map ${cv.run.id} · ${String(cv.run.head).slice(0, 7)} · ${ist(cv.run.made_at)}` : '') : 'Code map', go: '' }];
    title = 'Code under the plan';
  }
  setHtml($('crumbs'), crumbs.map((c, i) => (i ? '<span class="arrow" aria-hidden="true">›</span>' : '') + `<button type="button" class="crumb${c.go ? '' : ' last'}" data-crumb="${c.go}">${esc(c.name)}</button>`).join(''));
  $('title').textContent = title || '';
  setHtml($('headr'), S.tab === 'kd' ? kdBarHtml(S.kdSec, S.kd) : '');
  const shown = Q.kw.map((k, i) => ({ k, i })).filter(({ i }) => Q.on[i].shown);
  $('kwf').hidden = !shown.length;
  $('kwf').innerHTML = shown.length ? `<span class="lead">Show</span>` + shown.map(({ k, i }) => {
    const on = Q.on[i].on;
    return `<button type="button" class="kw" data-kw="${esc(k.key)}" aria-pressed="${on}" title="${esc(k.auto ? 'Found side by side' : 'Your keyword')}" style="border:1.5px ${k.auto ? 'dashed' : 'solid'} ${k.col};opacity:${on ? 1 : 0.5}"><span class="dot" style="background:${on ? k.col : '#FFFFFF'};border:1.5px solid ${k.col}"></span>${esc(k.key)}<span class="n">${Q.global[i]}</span></button>`;
  }).join('') : '';
}

/* ------------------------------------------------------------ the bell and the agents (box 13) */

function loadNotices() {
  Promise.all([getJson('/api/notices'), getJson('/api/agents')])
    .then(([n, a]) => { S.notices = n; S.agents = a.agents; S.noticesFailed = ''; })
    .catch((e) => { S.noticesFailed = e.message; })
    .then(renderTop);
}

function renderTop() {
  const N = S.notices, boxes = N ? N.count : 0, b = $('bellcount'), bell = $('bellbtn');
  const seen = deskSeen() || new Set(), fresh = (S.deskEvents || []).filter((e) => !seen.has(e.key)).length;
  const count = boxes + fresh;
  b.hidden = !count; b.textContent = count > 99 ? '99+' : String(count);
  bell.classList.toggle('ring', count > 0);
  bell.setAttribute('aria-label', count ? [boxes ? `${boxes} box${boxes === 1 ? '' : 'es'} the code has moved past` : '',
    fresh ? `${fresh} agent job${fresh === 1 ? '' : 's'} waiting, failed or finished` : ''].filter(Boolean).join('; ') : 'Notices: nothing new');
  for (const [id, k] of [['bellbtn', 'bell'], ['agentsbtn', 'agents'], ['canvasesbtn', 'canvases']]) { const el = $(id); if (!el) continue; el.setAttribute('aria-expanded', String(S.drop === k)); el.classList.toggle('on', S.drop === k); }
  const D = $('drop');
  D.hidden = !S.drop;
  if (!S.drop) return;
  const html = S.drop === 'bell' ? bellHtml() : S.drop === 'canvases'
    ? canvasListHtml(S.canvasList, { busy: S.canvasBusy, said: S.canvasSaid, failed: S.canvasFailed }) : agentsHtml();
  if (D.dataset.html !== html) { D.innerHTML = html; D.dataset.html = html; }
  // Shown in the open bell: seen. They stay listed, no longer marked new or counted.
  if (S.drop === 'bell' && fresh) { saveSeen([...seen, ...S.deskEvents.map((e) => e.key)]); b.hidden = !boxes; b.textContent = String(boxes); bell.classList.toggle('ring', boxes > 0); }
}

function noticeHtml(n, muted) {
  const regs = regionsOf(n), cs = liveCommits(n);
  return `<div class="nt${muted ? ' muted' : ''}"><div class="nth"><b>${esc(short(n.box))}</b><span class="mt">${esc(n.name)} · notice ${n.id}</span></div>` +
    `<div class="mt">${esc(sinceLine(n, ist))}${muted ? ' · in progress: the box was reworded for this work' : ''}</div>` +
    `<div class="ntr">${regs.map((r) => `<button type="button" class="row" data-nreg="${esc(r.id)}" data-nrepo="${esc(n.repo)}" title="Open it on the Code map"><span class="nm">${esc(regionLabel(r))}</span><span class="mt">${r.commits > 1 ? r.commits + ' commits' : ''}</span></button>`).join('')}</div>` +
    `<div class="ntc">${cs.map((c) => `<div><span class="sha">${esc(c.sha.slice(0, 7))}</span> <span class="muted">${esc(ist(c.at))}</span> ${esc(c.subject)}</div>`).join('')}</div></div>`;
}

function bellHtml() {
  const N = S.notices;
  if (!N) return `<p class="muted">${S.noticesFailed ? 'Could not read the notices: ' + esc(S.noticesFailed) : 'Reading the notices…'}</p>`;
  return eventsHtml(S.deskEvents || [], deskSeen() || new Set()) + `<h3>Boxes the code has moved past</h3>` +
    (N.behind.length ? N.behind.map((n) => noticeHtml(n, false)).join('') : '<p class="muted">None: every built box still matches its code.</p>') +
    (N.progress.length ? `<h3>Work in progress</h3>` + N.progress.map((n) => noticeHtml(n, true)).join('') : '') +
    (N.closed.length ? `<h3>Closed lately</h3>` + N.closed.map((n) => `<div class="nt closed"><div class="nth"><b>${esc(short(n.box))}</b><span class="mt">${esc(n.name)} · notice ${n.id} · ${esc(ist(n.closed_at))}</span></div><div class="mt">${esc(closedLine(n))}</div></div>`).join('') : '') +
    `<p class="muted foot">Ask an agent to check a notice. It closes it with<br><code>automatu notices close ID --by NAME --done | --still-right | --ignored "…"</code></p>`;
}

function agentsHtml() {
  const A = S.agents;
  if (!A) return `<p class="muted">${S.noticesFailed ? 'Could not read the agents: ' + esc(S.noticesFailed) : 'Reading the agents…'}</p>`;
  return `<h3>Agents and what they answer for</h3>` + (A.length ? A.map((g) => `<div class="nt"><div class="nth"><b>${esc(g.agent)}</b></div>` +
    g.repos.map((r) => `<div class="ag"><span class="nm">${esc(r.name)}</span><span class="mt">since ${esc(ist(r.since))} · ${r.behind ? `<b class="hot">${r.behind} behind</b>` : 'none behind'}${r.progress ? ` · ${r.progress} in progress` : ''}</span></div>`).join('') + `</div>`).join('')
    : '<p class="muted">No agent answers for a repository yet.</p>') +
    `<p class="muted foot">An agent registers with<br><code>automatu agent register REPO --agent NAME</code></p>`;
}

/* The Canvases sheet (box 24): NoteX's canvases, each added or not. */
function loadCanvasList() {
  getJson('/api/canvases/available')
    .then((j) => { S.canvasList = j; S.canvasFailed = ''; })
    .catch((e) => { S.canvasFailed = e.message; })
    .then(renderTop);
}

/* Add or remove one canvas; the Main map is read again so it shows at once. */
function changeCanvas(b) {
  const add = b.dataset.canvasAdd != null, name = add ? b.dataset.canvasAdd : b.dataset.canvasRemove;
  if (!add && !window.confirm(`Take ${name} out of AutomatU? It leaves the map, search and Knowledge Desk's index; the canvas itself is not touched.`)) return;
  S.canvasBusy = name; S.canvasSaid = ''; renderTop();
  post(add ? '/api/canvases/add' : '/api/canvases/remove', { canvas: name })
    .then((j) => { S.canvasSaid = j.problem ? `Not ${add ? 'added' : 'removed'}: ${j.problem}` : `${name} ${add ? 'added' : 'removed'}.`; return j.changed ? reloadCanvases() : null; })
    .catch(() => { S.canvasSaid = 'AutomatU could not be reached.'; })
    .then(() => { S.canvasBusy = ''; loadCanvasList(); });
}

async function reloadCanvases() {
  const cv = await getJson('/api/canvases');
  S.m = model(cv.canvases); S.layouts = {}; S.memo = {}; S.path = ['root']; S.sel = null;
  render();
}

/* A region named on a notice, opened on the Code map. */
function openNoticeRegion(repo, rid) {
  S.drop = null; renderTop();
  S.tab = 'code'; S.tRun = null; S.tPhase = null; S.tMoment = null; S.net = null;
  if (S.repo !== repo) { S.repo = repo; S.cview = null; try { localStorage.setItem('automatu.repo', repo); } catch (_) {} }
  S.pendingRegion = rid; S.pendingNet = false;
  loadCode();
  render();
}

export function render() {
  renderChrome();
  $('panel').hidden = S.tab === 'canvas' || S.tab === 'kd' || (S.tab === 'code' && !!S.net);
  if (S.tab === 'code') renderCode();
  else if (S.tab === 'canvas') renderBoard();
  else if (S.tab === 'kd') renderKd();
  else renderMain();
}

/* ------------------------------------------------------------ the agents, as their cards */

/* The Agents tab (box 22, t-2b6d9b3541): read from /api/desks, which reads each
   desk's Agent Card and what it is doing; refreshed while the tab is open. */
/* Someone is typing in this part of the page: a text box there has focus. A
   button or a menu that was just used does not count, or a click on Save
   would never show what came of it. */
function typingIn(sel) {
  const a = document.activeElement;
  return !!(a && a.matches && a.matches('textarea, select, input:not([type=checkbox]):not([type=radio])') && a.closest(sel));
}

/* The page refreshes every few seconds; what it draws is replaced only when it
   changed, so a refresh that brings nothing new never resets the page. */
function kdStage(html) {
  renderChrome();
  const next = `<div class="kdpage"><div class="kdbody">${html}</div></div>`;
  if (S.kdDrawn === next && $('stage').querySelector('.kdpage')) return;
  S.kdDrawn = next;
  $('stage').innerHTML = next;
}

/* What is typed or picked in the desk form is kept as it is entered, so a
   redraw puts it back instead of emptying the form. */
function keepForm(f) {
  const fd = new FormData(f);
  S.kdForm = { ...(S.kdForm || {}), name: fd.get('name') || '', role: fd.get('role') || '',
    main_canvas: fd.get('main_canvas') || '', attached: fd.getAll('attached'), owner: fd.get('owner') || '' };
}
for (const ev of ['input', 'change']) {
  document.addEventListener(ev, (e) => {
    const f = e.target.closest && e.target.closest('[data-kdform]');
    if (f) keepForm(f);
  });
}

function renderKd() {
  if (S.kdSec === 'ask') { if (typingIn('.askbox')) return renderChrome(); return kdStage(askHtml(S.ask, addedCanvases())); }
  if (S.kdSec === 'flows') return renderWorkflows();
  if (S.kdSec === 'tracking') return kdStage(kdTrackingHtml(S.kd, addedCanvases()));
  if (S.kdSec === 'monitoring') return kdStage(monitoringHtml(S.kdMon));
  return renderDesks();
}

/* The canvases a desk may name: the ones the user added (box 24). */
const addedCanvases = () => (S.m ? S.m.reg.root.children.map((id) => S.m.reg[id].name) : []);

function renderDesks() {
  if (S.deskRun) {
    const d = ((S.desks && S.desks.desks) || []).find((x) => x.url === S.deskRun.desk);
    kdStage(runViewHtml(d, S.deskRun.run));
    return;
  }
  /* Keep what is being typed in the form: redraw it only when nothing in it has focus. */
  if (typingIn('[data-kdform]')) return;
  kdStage(kdDesksHtml(S.kd, S.kdForm, addedCanvases(), S.kdSaid) +
    `<section class="kd"><h2>Hosted on this PC</h2></section>` +
    (S.desks ? desksHtml(S.desks) : '<div class="status">Looking for the desks…</div>'));
}

/* ------------------------------------------------------------ Ask */

/* The questions asked here, newest first, kept in this browser only - the
   question, never the answer: asking again reads the canvases as they are now. */
function askHistory() {
  try { const v = JSON.parse(localStorage.getItem('automatu.asks') || '[]'); return Array.isArray(v) ? v.filter((h) => h && h.q).slice(0, 8) : []; } catch (_) { return []; }
}
function rememberAsk(q, only) {
  const next = [{ q, only }].concat(askHistory().filter((h) => h.q !== q)).slice(0, 8);
  try { localStorage.setItem('automatu.asks', JSON.stringify(next)); } catch (_) {}
}

/* A question put to Knowledge Desk through AutomatU (over A2A, with AutomatU's
   token); the answer replaces the one shown, and a late answer to an older
   question is dropped. */
function askNow(q, only) {
  q = String(q || '').trim();
  if (!q) return;
  const A = S.ask = { q, only: only !== false, busy: true, a: null, err: '', cite: null };
  rememberAsk(q, A.only);
  S.tab = 'kd'; S.kdSec = 'ask';
  render();
  getJson('/api/kd/ask?q=' + encodeURIComponent(q) + '&only=' + (A.only ? 'built' : 'all'))
    .then((j) => { if (S.ask !== A) return; if (j.error) A.err = j.error; else { A.a = j; A.cite = (j.sentences || []).length ? 1 : null; } })
    .catch((e) => { if (S.ask === A) A.err = 'AutomatU could not ask: ' + e.message; })
    .then(() => { if (S.ask === A) { A.busy = false; if (inKd('ask')) render(); } });
}

function askClick(el) {
  const A = S.ask, a = el.dataset.ask;
  if (a === 'only') { A.only = !(A.only !== false); return render(); }
  if (a === 'plans') return askNow(A.q, false);
  if (a === 'built') return askNow(A.q, true);
  if (a === 'copy') {
    const done = () => { el.textContent = 'Copied'; setTimeout(() => { el.textContent = 'Copy with citations'; }, 1600); };
    try { navigator.clipboard.writeText(askText(A)).then(done, () => { el.textContent = 'Could not copy'; }); } catch (_) { el.textContent = 'Could not copy'; }
  }
}

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-askform]');
  if (!f) return;
  e.preventDefault();
  const q = new FormData(f).get('q');
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  askNow(q, S.ask.only);
});

/* ------------------------------------------------------------ agents in AutomatU, one at each desk (box 30) */

/* The window the Agents button opens: outside the map, so redrawing the map
   never closes it or loses what is being typed. The agent works on the server;
   the chat is read again every moment while the window is open, since other
   agents write to it too. */
let talkTimer = 0;

function openTalk(canvas, btn) {
  if (S.talk && S.talk.canvas === canvas) return closeTalk();
  const r = btn.getBoundingClientRect();
  S.talk = { canvas, x: r.left, y: r.bottom + 6, data: null, agent: 'agy', model: '', folder: undefined, draft: '', said: '', busy: false };
  renderTalk();
  loadTalk();
}

function closeTalk() {
  clearTimeout(talkTimer);
  S.talk = null;
  renderTalk();
}

function renderTalk() {
  const el = $('talk'), T = S.talk;
  el.hidden = !T;
  if (!T) { setHtml(el, ''); return; }
  /* Landscape on a wide screen: the chat beside a panel of what the agent is
     doing; a narrow screen keeps the tall window. Either way it never runs off
     the screen, and only its middle scrolls. */
  T.wide = innerWidth >= 760;
  el.classList.toggle('wide', T.wide);
  if (T.wide) {
    const w = Math.min(900, innerWidth - 24), h = Math.min(560, innerHeight - 24);
    el.style.width = w + 'px';
    el.style.left = Math.max(12, Math.min(T.x - 120, innerWidth - w - 12)) + 'px';
    el.style.top = Math.max(12, Math.min(T.y, innerHeight - h - 12)) + 'px';
    el.style.height = h + 'px';
    el.style.maxHeight = '';
  } else {
    const w = Math.min(420, innerWidth - 24);
    el.style.width = w + 'px';
    el.style.left = Math.max(12, Math.min(T.x, innerWidth - w - 12)) + 'px';
    const top = Math.max(12, Math.min(T.y, innerHeight - 480));
    el.style.top = top + 'px';
    el.style.height = '';
    el.style.maxHeight = (innerHeight - top - 12) + 'px';
  }
  if (typingIn('#talk')) return;
  /* Redrawn as the agent works: what is being read stays where it is, and the
     newest lines are followed only by someone already at the bottom. */
  const body = el.querySelector('.tk-body'), sidePane = el.querySelector('.tk-side'), sideTop = sidePane ? sidePane.scrollTop : 0;
  const keep = body ? { top: body.scrollTop, end: body.scrollTop + body.clientHeight >= body.scrollHeight - 8 } : null;
  const open = [...el.querySelectorAll('details.tk-d[open]')].map((d) => d.closest('[data-line]') && d.closest('[data-line]').dataset.line);
  setHtml(el, deskAgentHtml(T));
  el.querySelectorAll('[data-line]').forEach((n) => { if (open.includes(n.dataset.line)) { const d = n.querySelector('details.tk-d'); if (d) d.open = true; } });
  const b2 = el.querySelector('.tk-body');
  if (b2) b2.scrollTop = !keep || keep.end ? b2.scrollHeight : keep.top;
  const s2 = el.querySelector('.tk-side');
  if (s2) s2.scrollTop = sideTop;
}

function loadTalk() {
  clearTimeout(talkTimer);
  const T = S.talk;
  if (!T) return;
  getJson('/api/desk-agents?canvas=' + encodeURIComponent(T.canvas))
    .then((j) => {
      if (S.talk !== T) return;
      const placed = !!(T.data && T.data.agent) !== !!j.agent;
      T.data = j; renderTalk();
      if (placed) loadPlaced();
      talkTimer = setTimeout(loadTalk, j.agent && j.agent.state !== 'idle' ? 800 : 2500);
    })
    .catch((e) => { if (S.talk === T) { if (!T.data) T.data = { canvas: T.canvas, note: 'Could not read the desk: ' + e.message }; renderTalk(); talkTimer = setTimeout(loadTalk, 4000); } });
}

function talkPost(path, body, done) {
  const T = S.talk;
  if (!T || T.busy) return;
  T.busy = true; T.said = '';
  return post('/api/desk-agents/' + path, { canvas: T.canvas, ...body })
    .then((j) => { if (j && j.canvas) { T.data = j; if (done) done(); } else T.said = (j && j.detail) || 'AutomatU did not take that.'; })
    .catch(() => { T.said = 'AutomatU could not be reached.'; })
    .then(() => { T.busy = false; renderTalk(); loadTalk(); });
}

function talkClick(e) {
  const T = S.talk;
  if (e.target.closest('[data-talk-close]')) return closeTalk();
  const pk = e.target.closest('[data-agent-pick]');
  if (pk) { T.agent = pk.dataset.agentPick; T.model = ''; return renderTalk(); }
  const an = e.target.closest('[data-agent-answer]');
  if (an) return talkPost('answer', { ask: Number(an.dataset.agentAnswer), allow: an.dataset.allow === '1' });
  const tb = e.target.closest('[data-agent-takeback]');
  if (tb) return talkPost('take-back', { item: Number(tb.dataset.agentTakeback) });
  if (e.target.closest('[data-agent-stop]')) return talkPost('stop', {});
  if (e.target.closest('[data-agent-detach]')) {
    const ag = T.data && T.data.agent;
    if (!window.confirm(`Detach ${ag ? AGENT_NAMES[ag.agent] || ag.agent : 'the agent'} from the ${T.data.desk.name} desk? It stops, and so does whatever it started, such as a site it serves. The chat is kept.`)) return;
    return talkPost('detach', {}, loadPlaced);
  }
}

document.addEventListener('submit', (e) => {
  const T = S.talk;
  const choose = e.target.closest('[data-agentform]'), send = e.target.closest('[data-agentsend]');
  if (!T || (!choose && !send)) return;
  e.preventDefault();
  const f = new FormData(e.target);
  if (choose) return talkPost('choose', { agent: String(f.get('agent') || T.agent), model: String(f.get('model') || ''), folder: String(f.get('folder') || '').trim() }, loadPlaced);
  const text = String(f.get('text') || '');
  if (!text.trim()) return;
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  talkPost('send', { text }, () => { T.draft = ''; });
});
document.addEventListener('input', (e) => {
  if (!S.talk) return;
  if (e.target.id === 'tktext') S.talk.draft = e.target.value;
  if (e.target.id === 'tkfolder') S.talk.folder = e.target.value;
  if (e.target.id === 'tkmodel') S.talk.model = e.target.value;
});
document.addEventListener('change', (e) => { if (S.talk && e.target.id === 'tkmodel') S.talk.model = e.target.value; });

/* The canvases whose desk has an agent of AutomatU's: their buttons carry the dot. */
function loadPlaced() {
  return getJson('/api/desk-agents/cards').then((j) => {
    const now = (j.agents || []).map((a) => a.canvas).sort().join('|');
    const was = (S.placed || []).slice().sort().join('|');
    S.placed = (j.agents || []).map((a) => a.canvas);
    if (now !== was && S.tab === 'main') renderMain();
  }).catch(() => {});
}
const placedOn = (canvas) => (S.placed || []).includes(canvas);

/* The desk whose Main canvas a canvas is, as Knowledge Desk last said. */
const deskOf = (canvas) => ((S.kd && S.kd.desks) || []).find((d) => d.main_canvas === canvas) || null;
/* Who sits where: the Main map redraws when it changes, so the agents box's dot follows. */
const seated = (kd) => JSON.stringify(((kd && kd.desks) || []).map((d) => [d.main_canvas, (d.sitting || []).filter((s) => !s.away).map((s) => s.agent)]));

/* What Knowledge Desk serves the tab (box 25), and the Tracking layer on Main. */
function loadKd() {
  return getJson('/api/kd').then((fresh) => {
    const before = JSON.stringify(S.kd && S.kd.tracking), sat = seated(S.kd);
    const j = S.kd = mergeOverview(S.kd, fresh);
    if (S.tab === 'kd' && S.kdSec !== 'flows') renderKd();
    else if (S.tab === 'kd' && (!S.kf || !S.kf.desk) && (j.desks || []).length) renderWorkflows();   // the desks came in
    else if (S.tab === 'kd') renderChrome();
    else if (S.tab === 'main' && before !== JSON.stringify(j.tracking)) { S.track = null; renderMain(); }
    else if (S.tab === 'main' && sat !== seated(j)) renderMain();
  }).catch(() => {});
}

function kdClick(el) {
  const a = el.dataset.kd;
  if (a === 'cancel') { S.kdForm = null; return renderDesks(); }
  const d = ((S.kd && S.kd.desks) || []).find((x) => x.slug === el.dataset.slug);
  if (a === 'edit' && d) { S.kdForm = { slug: d.slug, name: d.name, role: d.role, main_canvas: d.main_canvas, attached: d.attached, owner: d.owner }; S.kdSaid = ''; return renderDesks(); }
  if (a === 'remove' && d) {
    if (!window.confirm(`Remove the ${d.name} desk? Whoever sits there leaves it; its canvases are not touched, and its versions are kept.`)) return;
    return sendDesk('remove', { desk: d.slug }, `${d.name} removed.`);
  }
}

function sendDesk(action, body, ok) {
  S.kdSaid = '';
  return post('/api/kd/desks/' + action, body)
    .then((j) => { S.kdSaid = j.done ? ok : `Not done: ${j.problem || j.detail || 'Knowledge Desk said no'}`; if (j.done) S.kdForm = null; })
    .catch(() => { S.kdSaid = 'AutomatU could not be reached.'; })
    .then(() => { if (S.kdForm) S.kdForm.busy = false; return loadKd(); })
    .then(renderDesks);
}

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-kdform]');
  if (!f) return;
  e.preventDefault();
  const slug = S.kdForm && S.kdForm.slug, body = formBody(new FormData(f), slug);
  S.kdForm = { ...(S.kdForm || {}), ...body, slug, busy: true };
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  renderDesks();
  sendDesk(slug ? 'change' : 'create', body, slug ? `${body.name || slug} changed.` : `${body.name} created: tell an agent to sit at the ${body.name} desk.`);
});

/* Runs the bell has already shown, kept in this browser. Before the first
   look, everything there is counts as seen, so old runs never ring. */
function deskSeen() {
  if (!S.deskSeen) {
    try { const v = localStorage.getItem('automatu.deskSeen'); S.deskSeen = v ? new Set(JSON.parse(v)) : null; } catch (_) { S.deskSeen = null; }
  }
  return S.deskSeen;
}
function saveSeen(keys) {
  S.deskSeen = new Set(keys);
  try { localStorage.setItem('automatu.deskSeen', JSON.stringify([...S.deskSeen].slice(-200))); } catch (_) {}
}

function loadDesks() {
  return fetch('/api/desks').then((r) => r.json()).then((j) => {
    S.desks = { ...j, said: S.deskSaid };
    S.deskEvents = deskEvents(j);
    if (!deskSeen()) saveSeen(S.deskEvents.map((e) => e.key));
    if (inKd('desks')) renderDesks();
    renderTop();
  }).catch(() => { S.desks = { desks: [], said: S.deskSaid }; if (inKd('desks')) renderDesks(); });
}

/* One run, step by step (box 21, t-2ddbfdabb6), refreshed while it is open. */
function loadDeskRun() {
  const R = S.deskRun;
  if (!R) return Promise.resolve();
  return fetch(`/api/desks/run?desk=${encodeURIComponent(R.desk)}&task=${encodeURIComponent(R.task)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (S.deskRun === R) { R.run = j || { task_id: R.task, job: '', state: 'not found', steps: [], asks: [], desk: R.desk }; if (inKd('desks')) renderDesks(); } })
    .catch(() => {});
}
function openDeskRun(desk, task) {
  S.drop = null; renderTop();
  S.tab = 'kd'; S.kdSec = 'desks'; S.deskRun = { desk, task, run: null };
  render(); loadDeskRun();
}

/* The user's Interrupt (box 23, t-5bb672b723): asked once, then passed on to the
   desk; what the desk says comes back on the tab, and the question in the chat. */
function interruptDesk(b) {
  const job = b.dataset.intJob || 'this job';
  if (!window.confirm(`Interrupt ${job}? The agent stops now, and the desk asks you in your chat what next.`)) return;
  b.disabled = true; b.textContent = 'Interrupting…';
  fetch('/api/desks/interrupt', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ desk: b.dataset.intDesk, task: b.dataset.intTask }) })
    .then((r) => r.json())
    .then((j) => { S.deskSaid = j.interrupted ? `Interrupted ${job}: answer the desk in your chat.` : `Not interrupted: ${j.why || j.detail || 'the desk said no'}`; })
    .catch(() => { S.deskSaid = 'Not interrupted: AutomatU could not reach the desk.'; })
    .then(loadDesks);
}

/* ------------------------------------------------------------ the desks' workflows (box 20) */

/* The Workflows tab (box 20, t-d966145acd): a desk job's flow, arranged here,
   checked by the desk on save, kept by AutomatU in time; and the desk's grants. */
function renderWorkflows() {
  /* Typing in the flow editor is not redrawn under the user. */
  if (typingIn('.kfedit')) return;
  S.kf = S.kf || {};
  S.kf.desks = ((S.kd && S.kd.desks) || []).map((d) => ({ slug: d.slug, name: d.name }));
  if (!S.kf.desk && S.kf.desks.length) { S.kf.desk = S.kf.desks[0].slug; loadKf(S.kf.desk); }
  kdStage(kfHtml(S.kf) + `<section class="kd"><h2>Hosted desks' jobs</h2></section>` + editorHtml(S.wf));
}

/* ------------------------------------------------------------ the created desks' flows (K5) */

function loadKf(desk, open) {
  if (!desk) return Promise.resolve();
  return getJson('/api/kd/flows?desk=' + encodeURIComponent(desk)).then((j) => {
    if (!S.kf || S.kf.desk !== desk) return;
    S.kf.data = j;
    const want = open || (S.kf.name == null && j.flows && j.flows[0] ? j.flows[0].name : null);
    const f = want && (j.flows || []).find((x) => x.name === want);
    if (f) { S.kf.name = f.name; S.kf.steps = JSON.parse(JSON.stringify(f.steps)); }
    if (inKd('flows')) renderWorkflows();
  }).catch((e) => { if (S.kf) S.kf.data = { error: e.message }; if (inKd('flows')) renderWorkflows(); });
}

function kfClick(el) {
  const K = S.kf, a = el.dataset.kf, i = +el.dataset.i;
  K.said = ''; K.problems = [];
  if (a === 'desk') { S.kf = { desks: K.desks, desk: el.dataset.slug, data: null, name: null, steps: [] }; renderWorkflows(); return loadKf(el.dataset.slug); }
  if (a === 'open') { const f = (K.data.flows || []).find((x) => x.name === el.dataset.name); if (f) { K.name = f.name; K.steps = JSON.parse(JSON.stringify(f.steps)); K.editing = false; } return renderWorkflows(); }
  if (a === 'new') { K.name = ''; K.steps = starterFlow(); K.editing = true; return renderWorkflows(); }
  if (a === 'edit') { K.editing = true; return renderWorkflows(); }
  if (a === 'done') {
    const f = (K.data.flows || []).find((x) => x.name === K.name) || (K.data.flows || [])[0];
    if (f) { K.name = f.name; K.steps = JSON.parse(JSON.stringify(f.steps)); }
    K.editing = false; return renderWorkflows();
  }
  if (a === 'up' || a === 'down') { K.steps = moveFlowStep(K.steps, i, a === 'up' ? -1 : 1); return renderWorkflows(); }
  if (a === 'remove') { K.steps = removeFlowStep(K.steps, i); return renderWorkflows(); }
  if (a === 'save') {
    K.busy = true; renderWorkflows();
    return post('/api/kd/flows/save', { desk: K.desk, name: K.name, steps: K.steps })
      .then((j) => { K.problems = j.problems || []; K.said = j.saved ? `Saved as version ${j.version}.` : (j.note ? 'Nothing changed.' : ''); return j.saved ? loadKf(K.desk, K.name) : null; })
      .catch(() => { K.problems = ['AutomatU could not be reached.']; })
      .then(() => { K.busy = false; renderWorkflows(); });
  }
  if (a === 'yes' || a === 'no') {
    el.disabled = true;
    return post('/api/kd/runs/answer', { run: el.dataset.run, yes: a === 'yes' })
      .then((j) => { K.said = j.done ? (a === 'yes' ? 'Yes passed on: the agent gets its next step when it next asks.' : 'No passed on: the run has ended.') : `Not passed on: ${j.problem || 'Knowledge Desk said no'}`; })
      .catch(() => { K.said = 'AutomatU could not be reached.'; })
      .then(() => loadKf(K.desk, K.name));
  }
}

function kfChange(el) {
  const K = S.kf;
  if (!K) return;
  if (el.dataset.kfAdd) { K.steps = addFlowStep(K.steps || [], el.value); el.value = ''; return renderWorkflows(); }
  const f = el.dataset.kfField;
  if (f === 'name') { K.name = el.value; return; }
  K.steps = setFlowField(K.steps, +el.dataset.i, f, el.type === 'checkbox' ? el.checked : el.value);
  if (f === 'mode') renderWorkflows();
}

/* ------------------------------------------------------------ monitoring (K6) */

function loadMon() {
  return getJson('/api/kd/monitoring').then((j) => { S.kdMon = j; if (inKd('monitoring')) renderKd(); })
    .catch((e) => { S.kdMon = { up: false, note: e.message }; if (inKd('monitoring')) renderKd(); });
}

function openWorkflows() {
  S.wf = S.wf || {};
  S.kf = S.kf || {};
  const created = (S.kd && S.kd.desks) || [];
  if (!S.kf.desk && created.length) { S.kf.desk = created[0].slug; loadKf(S.kf.desk); }
  const pick = () => {
    S.wf.desks = ((S.desks && S.desks.desks) || []);
    if (!S.wf.desk) { const d = S.wf.desks.find((x) => x.up && x.live); if (d) return loadWorkflows(d.url); }
    if (inKd('flows')) renderWorkflows();
  };
  return (S.desks ? Promise.resolve() : loadDesks()).then(pick);
}

function loadWorkflows(url, keepJob) {
  const W = S.wf;
  W.desk = url; W.data = null; W.error = ''; W.problems = []; W.said = ''; W.grantsSaid = '';
  if (inKd('flows')) renderWorkflows();
  return fetch('/api/workflows?desk=' + encodeURIComponent(url))
    .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.detail || r.statusText)))))
    .then((j) => {
      W.data = j;
      const jobs = Object.keys(j.catalogue.jobs);
      if (!keepJob || !jobs.includes(W.job)) W.job = jobs[0];
      startDraft();
      const g = j.current.grants || j.catalogue.grants || {};
      W.grants = { writes: [...(g.writes || [])], asks: [...(g.asks || [])] };
    })
    .catch((e) => { W.error = 'Could not read the desk: ' + e.message; })
    .then(() => { if (inKd('flows')) renderWorkflows(); });
}

function startDraft(steps) {
  const W = S.wf, cur = W.data.current.jobs[W.job];
  W.draft = normal(steps || (cur ? cur.arrangement.steps : W.data.catalogue.jobs[W.job].steps));
}

function post(path, body) {
  return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json());
}

function workflowsClick(el) {
  const W = S.wf, a = el.dataset.wf, i = +el.dataset.i, v = el.dataset.v;
  W.said = ''; W.problems = [];
  if (a === 'desk') return loadWorkflows(v);
  if (a === 'job') { W.job = v; startDraft(); }
  else if (a === 'move') W.draft = moveStep(W.draft, i, +v);
  else if (a === 'remove') W.draft = removeStep(W.draft, i);
  else if (a === 'add') W.draft = addStep(W.draft, v);
  else if (a === 'discard') startDraft();
  else if (a === 'default') { W.draft = normal(W.data.catalogue.jobs[W.job].steps); W.said = "The desk's default is in the editor: save it to run it again."; }
  else if (a === 'load') {
    const h = (W.data.history.jobs[W.job] || []).find((x) => String(x.version) === v);
    if (h) { W.draft = normal(h.steps); W.said = `Version ${v} is in the editor: save it to run it again.`; }
  } else if (a === 'save') {
    el.disabled = true;
    return post('/api/workflows/save', { desk: W.desk, job: W.job, steps: toSave(W.draft), note: W.note || '' })
      .then((r) => {
        if (r.saved) { W.note = ''; return loadWorkflows(W.desk, true).then(() => { W.said = `Saved as v${r.version}: the next run of ${W.job} runs it.`; renderWorkflows(); }); }
        W.problems = r.problems || [r.detail || 'not saved']; renderWorkflows();
      }).catch(() => { W.problems = ['AutomatU could not reach the desk.']; renderWorkflows(); });
  } else if (a === 'unwrite') W.grants.writes.splice(i, 1);
  else if (a === 'addcanvas') {
    const box = document.querySelector('[data-wf="newcanvas"]'), name = box ? box.value.trim() : '';
    if (name && !W.grants.writes.includes(name)) W.grants.writes.push(name);
  } else if (a === 'savegrants') {
    el.disabled = true;
    return post('/api/workflows/grants', { desk: W.desk, writes: W.grants.writes, asks: W.grants.asks })
      .then((r) => {
        if (r.saved) return loadWorkflows(W.desk, true).then(() => { W.grantsOk = true; W.grantsSaid = `Saved as v${r.version}: the desk holds to it from its next message.`; renderWorkflows(); });
        W.grantsOk = false; W.grantsSaid = 'The desk refused them: ' + (r.problems || []).join('; '); renderWorkflows();
      });
  }
  renderWorkflows();
}

function workflowsChange(el) {
  const W = S.wf, a = el.dataset.wf, i = +el.dataset.i;
  if (a === 'stop') W.draft = setPlaced(W.draft, i, { stop_before: el.checked });
  else if (a === 'back') W.draft = setPlaced(W.draft, i, { back_to: el.value === W.draft[i].step ? null : el.value });
  else if (a === 'tries') W.draft = setPlaced(W.draft, i, { tries: Math.max(1, Math.min(5, +el.value || 1)) });
  else if (a === 'ask') W.grants.asks = el.checked ? [...new Set(W.grants.asks.concat([el.dataset.v]))] : W.grants.asks.filter((x) => x !== el.dataset.v);
  else if (a === 'note') { W.note = el.value; return; }
  else return;
  W.said = ''; W.problems = [];
  renderWorkflows();
}

document.addEventListener('change', (e) => {
  const kfe = e.target.closest('[data-kf-field], [data-kf-add]');
  if (kfe && inKd('flows')) return kfChange(kfe);
  const el = e.target.closest('[data-wf]');
  if (el && inKd('flows')) workflowsChange(el);
});

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
  const talkBox = e.target.closest('[data-talk]');
  if (talkBox) return openTalk(talkBox.dataset.talk, talkBox);
  if (S.talk && e.target.closest('#talk')) return talkClick(e);
  if (S.talk) closeTalk();   // a click elsewhere puts the window away; a running task carries on
  const dropBtn = e.target.closest('[data-drop]');
  if (dropBtn) {
    S.drop = S.drop === dropBtn.dataset.drop ? null : dropBtn.dataset.drop;
    if (S.drop === 'canvases') { S.canvasSaid = ''; loadCanvasList(); } else if (S.drop) loadNotices();
    return renderTop();
  }
  const cvb = e.target.closest('[data-canvas-add], [data-canvas-remove]');
  if (cvb) return changeCanvas(cvb);
  const nreg = e.target.closest('[data-nreg]');
  if (nreg) return openNoticeRegion(nreg.dataset.nrepo, nreg.dataset.nreg);
  if (S.drop && !e.target.closest('#drop')) { S.drop = null; renderTop(); }
  const pic = e.target.closest('[data-pic]');
  if (pic) return openPic(pic.dataset.pic, pic.dataset.picname);
  const intr = e.target.closest('[data-int-task]');
  if (intr) return interruptDesk(intr);
  const askb = e.target.closest('button[data-ask]');
  if (askb) return askClick(askb);
  const cite = e.target.closest('[data-ask-cite]');
  if (cite) { const n = +cite.dataset.askCite; S.ask.cite = S.ask.cite === n ? null : n; return render(); }
  const again = e.target.closest('[data-ask-again]');
  if (again) { const h = askHistory()[+again.dataset.askAgain]; if (h) askNow(h.q, h.only); return; }
  const slc = e.target.closest('[data-sl-canvas]');
  if (slc && S.m) {
    const id = slc.dataset.slCanvas;
    if (S.tab === 'canvas') { if (S.bcanvas !== id) S.bview = null; S.bcanvas = id; return render(); }
    S.tab = 'main'; return go(pathTo(S.m.reg, id), null, 0, 0, 1);
  }
  const deskFlow = e.target.closest('button[data-kd="flow"]');
  if (deskFlow) {
    const desks = ((S.kd && S.kd.desks) || []).map((d) => ({ slug: d.slug, name: d.name }));
    S.kdSec = 'flows'; S.deskRun = null;
    S.kf = { desks, desk: deskFlow.dataset.slug, data: null, name: null, steps: [] };
    openWorkflows(); render(); loadKf(deskFlow.dataset.slug);
    return;
  }
  const kds = e.target.closest('[data-kdsec]');
  if (kds) { S.kdSec = kds.dataset.kdsec; S.deskRun = null; if (S.kdSec === 'flows') openWorkflows(); if (S.kdSec === 'monitoring') loadMon(); return render(); }
  const kdb = e.target.closest('button[data-kd]');
  if (kdb) return kdClick(kdb);
  const kfb = e.target.closest('button[data-kf]');
  if (kfb && inKd('flows')) return kfClick(kfb);
  const wfb = e.target.closest('button[data-wf]');
  if (wfb && inKd('flows')) return workflowsClick(wfb);
  const opener = e.target.closest('[data-run-task]');
  if (opener) return openDeskRun(opener.dataset.runDesk, opener.dataset.runTask);
  if (e.target.closest('[data-run-back]')) { S.deskRun = null; return render(); }
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
      S.tab = d.tab; if (d.tab === 'code') loadCode(); if (d.tab === 'kd') { loadDesks(); loadKd(); if (S.kdSec === 'flows') openWorkflows(); } render();
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
  if (S.talk) return closeTalk();
  if (S.drop) { const k = S.drop; S.drop = null; renderTop(); const f = $({ bell: 'bellbtn', canvases: 'canvasesbtn' }[k] || 'agentsbtn'); if (f) f.focus(); return; }
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
   or ?open=<canvas>>…>(box name) on the Main map, or ?ask=<question> on Ask - for sharing a view or
   recording one. */
function fromLink() {
  const u = new URLSearchParams(location.search);
  if (u.get('q')) { S.query = u.get('q'); $('term').value = S.query; }
  if (u.get('repo')) { const r = S.repos.find((x) => x.repo.split('/').pop().toLowerCase() === u.get('repo').toLowerCase()); if (r) S.repo = r.repo; }
  if (u.get('tab') === 'code') S.tab = 'code';
  if (u.get('tab') === 'kd') { S.tab = 'kd'; if (SECTIONS.some((x) => x[0] === u.get('sec'))) S.kdSec = u.get('sec'); }
  if (u.get('tab') === 'canvas' && S.m) {
    const name = (u.get('canvas') || '').toLowerCase();
    S.bcanvas = S.m.reg.root.children.find((id) => S.m.reg[id].name.toLowerCase() === name) || S.m.reg.root.children[0];
    S.tab = 'canvas';
  }
  if (u.get('box')) S.pendingBox = u.get('box');
  if (u.get('ask')) S.pendingAsk = { q: u.get('ask'), only: u.get('only') !== 'all' };
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
  if (inKd('flows')) openWorkflows();
  loadNotices();
  loadDesks();
  loadKd(); loadPlaced();
  if (inKd('monitoring')) loadMon();
  if (S.pendingAsk) { askNow(S.pendingAsk.q, S.pendingAsk.only); S.pendingAsk = null; }
  setInterval(() => {
    follow().catch(() => {}); loadNotices(); loadDesks(); loadKd();
    if (inKd('desks') && S.deskRun) loadDeskRun();
    if (inKd('monitoring')) loadMon();
    if (inKd('flows') && S.kf && S.kf.desk && S.kf.data && !S.kf.busy) loadKf(S.kf.desk);   // runs move on
  }, 4000);
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
