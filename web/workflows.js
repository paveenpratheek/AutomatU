/*
 * The Workflows tab (box 20, t-d966145acd), with no DOM: a desk job's flow
 * drawn as an n8n-style row of steps joined by wires, each step's problems
 * shown going back to where they go, and the user's stops for their yes on
 * the wires; the steps the job can still take; the rules the desk will not let
 * an arrangement break; the arrangement's history; and the desk's grants -
 * the canvases its agent may write and the desks it may ask (t-7d4389282b).
 * The desk checks every save; AutomatU keeps what it accepts, in time, and
 * never on a canvas (t-0ad73f14d1).
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = (id) => String(id || '').replace(/_/g, ' ');
const WHO = { code: 'the desk', agent: 'the agent', user: 'you' };
const ago = (iso, now = Date.now()) => {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

export const W = 210, GAP = 64, TOP = 78, H = 196;

/* ------------------------------------------------------------ the arrangement, changed */

const clone = (steps) => steps.map((p) => ({ step: p.step, tries: p.tries ?? 3, back_to: p.back_to ?? null, stop_before: !!p.stop_before }));

export function normal(steps) { return clone(steps || []); }

/* A step moved one place left (-1) or right (+1); a back-to that would now point
   ahead of its step is taken back to the step itself, which the desk accepts. */
export function moveStep(steps, i, d) {
  const out = clone(steps), j = i + d;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return fixBacks(out);
}

export function removeStep(steps, i) {
  const gone = steps[i] && steps[i].step;
  return fixBacks(clone(steps).filter((_, k) => k !== i).map((p) => (p.back_to === gone ? { ...p, back_to: null } : p)));
}

export function addStep(steps, id) {
  if (steps.some((p) => p.step === id)) return clone(steps);
  return clone(steps).concat([{ step: id, tries: 3, back_to: null, stop_before: false }]);
}

export function setPlaced(steps, i, patch) {
  return fixBacks(clone(steps).map((p, k) => (k === i ? { ...p, ...patch } : p)));
}

function fixBacks(steps) {
  return steps.map((p, i) => (p.back_to && !steps.slice(0, i + 1).some((q) => q.step === p.back_to) ? { ...p, back_to: null } : p));
}

/* What is sent to the desk: a back-to to the step itself is the same as none. */
export function toSave(steps) {
  return steps.map((p) => {
    const o = { step: p.step };
    if (p.tries !== 3) o.tries = p.tries;
    if (p.back_to && p.back_to !== p.step) o.back_to = p.back_to;
    if (p.stop_before) o.stop_before = true;
    return o;
  });
}

export function same(a, b) { return JSON.stringify(toSave(a || [])) === JSON.stringify(toSave(b || [])); }

/* ------------------------------------------------------------ the flow, drawn */

/* The wires: one from each step to the next, with the user's stop on it; and
   from each step that can send work back, an arc to where its problems go. */
export function wiresSvg(steps, cat) {
  const n = steps.length, width = Math.max(1, n * W + (n - 1) * GAP + 40), mid = TOP + 34;
  const x = (i) => 20 + i * (W + GAP);
  const parts = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = x(i) + W, b = x(i + 1);
    parts.push(`<path class="wf-wire" d="M${a} ${mid} L${b - 6} ${mid}" marker-end="url(#wf-arrow)"/>`);
    if (steps[i + 1].stop_before) {
      const c = (a + b) / 2;
      parts.push(`<g class="wf-stopmark"><circle cx="${c}" cy="${mid}" r="11"/><text x="${c}" y="${mid + 4}" text-anchor="middle">⏸</text></g>`);
    }
  }
  steps.forEach((p, i) => {
    const st = cat[p.step];
    if (!st || !st.loops) return;
    const to = p.back_to ? steps.findIndex((q) => q.step === p.back_to) : i;
    const from = x(i) + W / 2, end = x(Math.max(0, to)) + W / 2;
    const d = to === i
      ? `M${from - 26} ${TOP} C${from - 26} ${TOP - 34} ${from + 26} ${TOP - 34} ${from + 26} ${TOP}`
      : `M${from} ${TOP} C${from} ${TOP - 62} ${end} ${TOP - 62} ${end} ${TOP}`;
    const lx = to === i ? from : (from + end) / 2, ly = to === i ? TOP - 30 : TOP - 50;
    parts.push(`<path class="wf-loop" d="${d}" marker-end="url(#wf-arrow-loop)"/>` +
      `<text class="wf-looplabel" x="${lx}" y="${ly}" text-anchor="middle">problems · up to ${esc(p.tries)}×</text>`);
  });
  return `<svg class="wf-wires" width="${width}" height="${TOP + H + 10}" aria-hidden="true">` +
    '<defs><marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z"/></marker>' +
    '<marker id="wf-arrow-loop" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>' +
    parts.join('') + '</svg>';
}

export function nodeHtml(p, i, steps, cat) {
  const st = cat[p.step] || { words: '', actor: 'code', loops: false };
  const backs = steps.slice(0, i + 1).map((q) => `<option value="${esc(q.step)}"${(p.back_to || p.step) === q.step ? ' selected' : ''}>` +
    `${q.step === p.step ? 'itself' : esc(words(q.step))}</option>`).join('');
  return `<div class="wf-node wf-a-${esc(st.actor)}" style="left:${20 + i * (W + GAP)}px;top:${TOP}px">` +
    `<div class="wf-nh"><span class="wf-num">${i + 1}</span><b>${esc(words(p.step))}</b></div>` +
    `<span class="wf-who">${esc(WHO[st.actor] || st.actor)}</span>` +
    `<p class="wf-what">${esc(st.words)}</p>` +
    `<label class="wf-opt"><input type="checkbox" data-wf="stop" data-i="${i}"${p.stop_before ? ' checked' : ''}> stop for my yes before this</label>` +
    (st.loops ? `<label class="wf-opt">problems go back to <select data-wf="back" data-i="${i}">${backs}</select></label>` +
      `<label class="wf-opt">up to <input type="number" min="1" max="5" value="${esc(p.tries)}" data-wf="tries" data-i="${i}"> tries</label>` : '') +
    `<div class="wf-ctl"><button type="button" data-wf="move" data-i="${i}" data-v="-1" title="Move it one step earlier"${i === 0 ? ' disabled' : ''}>◀</button>` +
    `<button type="button" data-wf="move" data-i="${i}" data-v="1" title="Move it one step later"${i === steps.length - 1 ? ' disabled' : ''}>▶</button>` +
    `<button type="button" data-wf="remove" data-i="${i}" title="Take this step out">✕</button></div></div>`;
}

export function flowHtml(steps, cat) {
  const n = Math.max(steps.length, 1);
  return `<div class="wf-flow" style="height:${TOP + H + 16}px"><div class="wf-canvas" style="width:${n * W + (n - 1) * GAP + 40}px;height:${TOP + H + 10}px">` +
    wiresSvg(steps, cat) + steps.map((p, i) => nodeHtml(p, i, steps, cat)).join('') + '</div></div>';
}

/* ------------------------------------------------------------ the whole tab */

export function editorHtml(wf, now = Date.now()) {
  if (!wf || !wf.desks) return '<div class="status">Looking for the desks…</div>';
  const deskBtns = wf.desks.map((d) => `<button type="button" class="wf-pick${d.url === wf.desk ? ' on' : ''}" data-wf="desk" data-v="${esc(d.url)}"` +
    `${d.up ? '' : ' disabled'}>${esc((d.card && d.card.name) || d.url)}${d.up ? '' : ' · not running'}</button>`).join('');
  const head = `<div class="dks-head"><b>Workflows</b> - arrange each desk job's flow, and what each desk may do. ` +
    'The desk checks every save; AutomatU keeps each version.</div>' + `<div class="wf-bar">${deskBtns}</div>`;
  if (!wf.desk) return `<div class="dks">${head}<p class="dk-idle">Pick a desk.</p></div>`;
  if (wf.error) return `<div class="dks">${head}<p class="dk-bad">${esc(wf.error)}</p></div>`;
  if (!wf.data) return `<div class="dks">${head}<div class="status">Reading the desk's steps…</div></div>`;
  const C = wf.data.catalogue, cat = Object.fromEntries(C.steps.map((s) => [s.id, s]));
  const jobs = Object.keys(C.jobs);
  const jobBtns = jobs.map((j) => {
    const v = wf.data.current.jobs[j];
    return `<button type="button" class="wf-pick${j === wf.job ? ' on' : ''}" data-wf="job" data-v="${esc(j)}">${esc(j)}` +
      `<span class="wf-ver">${v ? 'yours, v' + esc(v.version) : 'the default'}</span></button>`;
  }).join('');
  const cur = wf.data.current.jobs[wf.job];
  const base = cur ? cur.arrangement.steps : C.jobs[wf.job].steps;
  const dirty = !same(wf.draft, base);
  const left = C.steps.filter((s) => s.jobs.includes(wf.job) && !wf.draft.some((p) => p.step === s.id));
  const palette = left.length ? '<h4>Steps this job can take</h4><div class="wf-palette">' + left.map((s) =>
    `<button type="button" data-wf="add" data-v="${esc(s.id)}" title="${esc(s.words)}">+ ${esc(words(s.id))} <span class="wf-who">${esc(WHO[s.actor] || s.actor)}</span></button>`).join('') + '</div>' : '';
  const said = wf.problems && wf.problems.length
    ? '<div class="wf-refused"><b>The desk refused it:</b><ul>' + wf.problems.map((p) => `<li>${esc(p)}</li>`).join('') + '</ul></div>'
    : wf.said ? `<div class="dk-said">${esc(wf.said)}</div>` : '';
  const hist = (wf.data.history.jobs[wf.job] || []);
  const history = '<h4>Versions</h4><ul class="wf-hist">' +
    (hist.length ? hist.map((h) => `<li><button type="button" data-wf="load" data-v="${esc(h.version)}">v${esc(h.version)}</button>` +
      ` <span class="wf-who">${esc(ago(h.saved_at, now))}</span>${h.note ? ' · ' + esc(h.note) : ''}${cur && cur.version === h.version ? ' <b>· runs now</b>' : ''}</li>`).join('')
      : '<li class="dk-idle">None yet: the job runs the desk\'s default.</li>') + '</ul>';
  const actions = `<div class="wf-actions"><input type="text" placeholder="a note on this version (optional)" data-wf="note" value="${esc(wf.note || '')}">` +
    `<button type="button" class="wf-save" data-wf="save"${dirty ? '' : ' disabled'}>Save - the desk checks it</button>` +
    `<button type="button" data-wf="discard"${dirty ? '' : ' disabled'}>Discard changes</button>` +
    `<button type="button" data-wf="default">Start from the desk's default</button></div>`;
  return `<div class="dks">${head}<div class="wf-bar">${jobBtns}</div>` +
    `<p class="wf-sub">${esc(wf.job)} - ${cur ? `your arrangement v${esc(cur.version)} runs now` : 'the desk\'s default runs now'}${dirty ? ' · <b>changed, not saved</b>' : ''}</p>` +
    flowHtml(wf.draft, cat) + said + actions + palette +
    '<div class="wf-cols"><section><h4>Rules no arrangement may break</h4><ul class="wf-rules">' + C.rules.map((r) => `<li>${esc(r)}</li>`).join('') + '</ul></section>' +
    `<section>${history}</section><section>${grantsHtml(wf)}</section></div></div>`;
}

export function grantsHtml(wf) {
  const C = wf.data.catalogue, g = wf.grants || { writes: [], asks: [] };
  const held = C.grants || {};
  const saved = wf.data.current.grants;
  const dirty = JSON.stringify(g) !== JSON.stringify(saved ? { writes: saved.writes, asks: saved.asks } : { writes: held.writes || [], asks: held.asks || [] });
  return '<h4>What this desk may do</h4>' +
    `<p class="wf-who">Held now from ${esc(held.from || 'its config')}. Another canvas is asked of you; the rules canvas is never written.</p>` +
    '<div class="wf-grant"><span>May write:</span>' + g.writes.map((c, i) =>
      `<span class="wf-chip">${esc(c)} <button type="button" data-wf="unwrite" data-i="${i}" title="Take it away">✕</button></span>`).join('') +
    `<input type="text" placeholder="a canvas" data-wf="newcanvas"><button type="button" data-wf="addcanvas">Add</button></div>` +
    '<div class="wf-grant"><span>May ask:</span>' + (C.desks.length ? C.desks.map((d) =>
      `<label><input type="checkbox" data-wf="ask" data-v="${esc(d)}"${g.asks.includes(d) ? ' checked' : ''}> ${esc(d)}</label>`).join(' ') : '<span class="dk-idle">no other desk</span>') + '</div>' +
    (wf.grantsSaid ? `<div class="${wf.grantsOk ? 'dk-said' : 'wf-refused'}">${esc(wf.grantsSaid)}</div>` : '') +
    `<button type="button" class="wf-save" data-wf="savegrants"${dirty ? '' : ' disabled'}>Save what it may do</button>`;
}
