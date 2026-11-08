/*
 * The map view: the newest map snapshot of a repository, drawn as hexagons.
 * One coloured cluster per canvas section; a region placed in several
 * sections sits where their clusters meet and carries all their colours.
 */
import { layout, toPixel } from './layout.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const HEX = 13;

/* A section's name as shown: its box name, with its totem in front when
   another totem has a box of the same name. */
let names = {};
function nameSections(sections) {
  const base = (a) => a.split(' > ').pop();
  const seen = {};
  for (const s of sections) seen[base(s)] = (seen[base(s)] || 0) + 1;
  names = {};
  for (const s of sections) names[s] = seen[base(s)] > 1 ? s.split(' > ')[0].replace(/ \((totem|sub-totem)\)$/, '') + ' › ' + base(s) : base(s);
}
const short = (address) => names[address] || address.split(' > ').pop();

/* Colours only for sections that have code, spread evenly round the hue
   wheel and alternating in lightness, so neighbouring clusters differ. */
function colours(withCode) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
  const out = {};

  withCode.forEach((s, i) => {
    const hue = Math.round(i * 137.508 + 12) % 360;
    const light = (dark ? 60 : 50) + (i % 2 ? -8 : 4);
    out[s] = `hsl(${hue} ${i % 3 === 2 ? 45 : 62}% ${light}%)`;
  });
  return out;
}

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push((cx + size * Math.cos(a)).toFixed(1) + ',' + (cy + size * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}

const state = { map: null, colour: {}, hidden: new Set() };

function tip(html, e) {
  const t = $('tip');
  if (!html) { t.hidden = true; return; }
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(e.clientX + pad, innerWidth - w - 8) + 'px';
  t.style.top = Math.min(e.clientY + pad, innerHeight - h - 8) + 'px';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function drawMap() {
  const svg = $('map');
  svg.replaceChildren();
  const { run, places } = state.map;
  const { cells } = layout(places);
  $('empty').hidden = cells.length > 0;
  if (!cells.length) { $('empty').textContent = 'No region is placed under a section yet.'; svg.removeAttribute('viewBox'); return; }

  const defs = el('defs', {}, svg);
  const gradients = {};
  const fillFor = (sections) => {
    if (sections.length === 1) return state.colour[sections[0]];
    const id = 'g' + Object.keys(gradients).length;
    const k = sections.join('|');
    if (!gradients[k]) {
      const g = el('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
      sections.forEach((s, i) => {
        el('stop', { offset: (i / sections.length).toFixed(3), 'stop-color': state.colour[s] }, g);
        el('stop', { offset: ((i + 1) / sections.length).toFixed(3), 'stop-color': state.colour[s] }, g);
      });
      gradients[k] = `url(#${id})`;
    }
    return gradients[k];
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const at = {};
  const g = el('g', {}, svg);
  for (const c of cells) {
    const { x, y } = toPixel(c, HEX);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    const poly = el('polygon', { points: hexPoints(x, y, HEX - 0.5), fill: fillFor(c.sections), class: 'hex' }, g);
    poly.dataset.sections = JSON.stringify(c.sections);
    const p = places.find((x) => x.region === c.region);
    poly.addEventListener('mousemove', (e) => tip(
      `<code>${esc(c.region)}</code><ul>${c.sections.map((s) => `<li>${esc(short(s))}</li>`).join('')}</ul>` +
      `<span class="num">score ${p.score.toFixed(3)} · lead ${p.margin.toFixed(3)}</span>`, e));
    poly.addEventListener('mouseleave', () => tip(null));
    for (const s of c.sections) (at[s] = at[s] || { own: [], all: [] }).all.push({ x, y });
    if (c.sections.length === 1) at[c.sections[0]].own.push({ x, y });
  }
  /* A label at the middle of each cluster's own cells - shared cells would
     pull two labels onto the same spot. */
  for (const [s, cellsOf] of Object.entries(at)) {
    const pts = cellsOf.own.length ? cellsOf.own : cellsOf.all;
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length, y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const t = el('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'label' }, svg);
    t.dataset.section = s;
    t.textContent = short(s);
  }
  const pad = HEX * 3;
  const vw = maxX - minX + 2 * pad, vh = maxY - minY + 2 * pad;
  svg.setAttribute('viewBox', `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`);
  sizeLabels();
  applyHidden();
}

/* Labels stay 12px on screen however far the map is scaled to fit. */
function sizeLabels() {
  const svg = $('map');
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width) return;
  const scale = Math.min(svg.clientWidth / vb.width, svg.clientHeight / vb.height) || 1;
  for (const t of svg.querySelectorAll('.label')) {
    t.setAttribute('font-size', (12 / scale).toFixed(1));
    t.style.strokeWidth = (4 / scale).toFixed(1) + 'px';
  }
}

function applyHidden() {
  for (const h of document.querySelectorAll('#map .hex')) {
    const ss = JSON.parse(h.dataset.sections);
    h.classList.toggle('faded', ss.every((s) => state.hidden.has(s)));
  }
  for (const t of document.querySelectorAll('#map .label')) t.classList.toggle('faded', state.hidden.has(t.dataset.section));
}

async function loadMap(repo) {
  const r = await fetch('/api/map?repo=' + encodeURIComponent(repo));
  const j = await r.json();
  if (!r.ok) { $('meta').textContent = j.error; return; }
  state.map = j;
  state.hidden = new Set();
  const sections = j.run.sections.length ? j.run.sections : [...new Set(j.places.flatMap((p) => p.sections))];
  nameSections(sections);
  const withCode = new Set(j.places.flatMap((p) => [...p.sections, ...(p.near || [])]));
  state.colour = colours(sections.filter((s) => withCode.has(s)));
  const placed = j.places.filter((p) => p.sections.length).length;
  const shared = j.places.filter((p) => p.sections.length > 1).length;
  $('meta').innerHTML = `canvas <b>${esc(j.run.canvas)}</b> · at <b>${esc(j.run.head)}</b> · ` +
    `<b>${placed}</b> of ${j.places.length} regions placed${shared ? `, ${shared} in more than one section` : ''} · ` +
    `map made ${new Date(j.run.made_at).toLocaleString()}`;
  drawMap();
  window.dispatchEvent(new CustomEvent('map-loaded'));
}

async function start() {
  const r = await fetch('/api/repos');
  const { repos } = await r.json();
  const sel = $('repo');
  if (!repos.length) {
    $('empty').hidden = false;
    $('empty').textContent = 'No map made yet. Bind a repository to its canvas and run: automatu align <repo>';
    return;
  }
  for (const x of repos) sel.appendChild(Object.assign(document.createElement('option'), { value: x.repo, textContent: x.repo.split('/').pop() }));
  let saved = null;
  try { saved = localStorage.getItem('automatu.repo'); } catch (_) {}
  if (saved && repos.some((x) => x.repo === saved)) sel.value = saved;
  sel.addEventListener('change', () => { try { localStorage.setItem('automatu.repo', sel.value); } catch (_) {} loadMap(sel.value); });
  loadMap(sel.value);
}

addEventListener('resize', () => sizeLabels());
export { state, applyHidden, colours, short, esc };
start();
