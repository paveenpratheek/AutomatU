/*
 * The Knowledge Desk tab (box 25, t-8551b11d21): the junction between AutomatU
 * and Work Desks, shown in four sections - Desks, Flows, Tracking, Monitoring.
 * Everything here is read from Knowledge Desk (/api/kd); creating, changing and
 * removing a desk is the user's act passed on to it (t-d41a20184d). The Flows
 * section is the Workflows editor, and the hosted desks' cards and runs sit
 * under Desks; both are drawn by their own modules.
 *
 * The Tracking layer (t-799e6f44c2): the boxes a desk tracks, found on the Main
 * map from their canvas and address, ringed there.
 *
 * Ask: a question put to Knowledge Desk, answered with sentences quoted from
 * the canvases, each citing its box's hex.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lastOf = (address) => String(address || '').split(' > ').pop();
const strip = (s) => String(s).replace(/\s*\((totem|sub-totem)\)\s*$/, '').trim();

export const SECTIONS = [
  ['ask', 'Ask', 'Ask about your projects: sentences quoted from the canvases, each citing its box'],
  ['desks', 'Desks', 'The desks you created, who sits at each, and the desks with an agent hosted'],
  ['flows', 'Flows', "Each desk's flow, step by step, and its runs"],
  ['tracking', 'Tracking', 'The boxes each desk tracks, and what Knowledge Desk has indexed'],
  ['monitoring', 'Monitoring', 'A2A between desks, and tracing each agent\'s calls'],
];
export const HEADS = { ask: 'Ask about your projects', desks: 'Desks', flows: 'Flows', tracking: 'What changed', monitoring: 'Monitoring' };

export function kdBarHtml(sec, ov) {
  const changed = ((ov && ov.tracking) || []).filter((t) => t.state !== 'same').length;
  return `<nav class="seg kdbar" aria-label="Knowledge Desk sections">` + SECTIONS.map(([k, label, why]) =>
    `<button type="button" class="kdsec${sec === k ? ' on' : ''}" data-kdsec="${k}" aria-pressed="${sec === k}" title="${esc(why)}">${esc(label)}` +
    (k === 'tracking' && changed ? `<span class="badge">${changed}</span>` : '') + `</button>`).join('') + `</nav>`;
}

/* The hexagons' colours: a soft tone to fill, a deeper one to draw with. A
   canvas keeps its colour by its place among the canvases you added. */
export const TONES = ['#B9D2EA', '#F4C6B8', '#C2E0CE', '#DCCFF1', '#F5DDA3', '#B0DADB', '#F2C8D9', '#D3DEB0', '#C6CEF3', '#EBCFB2'];
export const DEEP = ['#4F7FB5', '#C6613F', '#4E8F68', '#7D5FC0', '#B38A22', '#2E8C91', '#B55A80', '#76893A', '#5767C0', '#A6713E'];
export function toneOf(name, names) {
  let i = (names || []).indexOf(name);
  if (i < 0) { i = 0; for (const ch of String(name || '')) i = (i * 31 + ch.charCodeAt(0)) >>> 0; }
  return { fill: TONES[i % TONES.length], deep: DEEP[i % DEEP.length] };
}
export function hexIcon(name, names, size = 16) {
  const t = toneOf(name, names);
  return `<svg class="hexi" width="${size}" height="${Math.round(size * 0.875)}" viewBox="0 0 16 14" aria-hidden="true"><polygon points="4,0.7 12,0.7 15.3,7 12,13.3 4,13.3 0.7,7" fill="${t.fill}" stroke="${t.deep}" stroke-width="${size > 24 ? 0.6 : 1}"></polygon></svg>`;
}

/* ------------------------------------------------------------ Ask */

/* A hex names its canvas first and its box last: h:<canvas>/<totem id>/<box>. */
export function hexParts(hex) {
  const s = String(hex || '').replace(/^h:/, ''), parts = s.split('/');
  return { canvas: parts[0] || '', id: parts[1] || '', box: parts.slice(2).join('/') || parts[parts.length - 1] || '' };
}

/* The answer's sentences numbered by the box they cite, in the order first cited. */
export function citations(answer) {
  const order = [], num = new Map();
  for (const s of (answer && answer.sentences) || []) if (!num.has(s.hex)) { num.set(s.hex, order.length + 1); order.push(s.hex); }
  const pass = new Map(((answer && answer.passages) || []).map((p) => [p.hex, p]));
  const sources = order.map((hex) => {
    const p = pass.get(hex) || {}, h = hexParts(hex), path = String(p.address || '').split(' > ').map(strip);
    return { n: num.get(hex), hex, canvas: h.canvas, id: h.id, box: path.length > 1 ? path[path.length - 1] : h.box, under: path.slice(0, -1).join(' › ') };
  });
  const read = ((answer && answer.passages) || []).filter((p) => !num.has(p.hex)).map((p) => {
    const h = hexParts(p.hex), path = String(p.address || '').split(' > ').map(strip);
    return { hex: p.hex, canvas: h.canvas, box: path[path.length - 1] || h.box, under: path.slice(0, -1).join(' › ') };
  });
  return { num, sources, read };
}

/* A: { q, only, busy, a, err, cite } - the question asked, and what came of it. */
export function askHtml(A, names) {
  A = A || {};
  const C = citations(A.a);
  let thread;
  if (!A.q) {
    thread = `<div class="askhello"><span class="asklead">What do you want to know?</span><span class="mt">Knowledge Desk answers from the canvases you added, quoting each sentence from its box. Built work only unless you turn that off.</span></div>`;
  } else {
    thread = `<div class="askq">${esc(A.q)}</div>`;
    if (A.busy) thread += `<div class="aska"><div class="askwho">${hexIcon('', [], 18)}<b>Knowledge Desk</b></div><p class="mt askwait">Reading the canvases…</p></div>`;
    else if (A.err) thread += `<div class="aska"><div class="askwho">${hexIcon('', [], 18)}<b>Knowledge Desk</b></div><p class="said">${esc(A.err)}</p></div>`;
    else if (A.a) {
      const ss = A.a.sentences || [], canv = new Set(C.sources.map((s) => s.canvas));
      thread += `<div class="aska"><div class="askwho">${hexIcon('', [], 18)}<b>Knowledge Desk</b><span class="asktag">${A.a.only === 'built' ? 'Built work only' : 'Plans included'}</span></div>` +
        (ss.length ? `<p class="asklead">Every sentence below is quoted from a box on your canvases, and each one names the box it came from.</p>` +
          `<div class="asklines">${ss.map((s) => {
            const n = C.num.get(s.hex), h = hexParts(s.hex), on = A.cite === n;
            return `<button type="button" class="askline${on ? ' on' : ''}" data-ask-cite="${n}"><span class="tx">“${esc(s.text)}”</span>` +
              (s.status && s.status !== 'built' ? `<span class="askst">${esc(s.status)}</span>` : '') +
              `<span class="askcite" style="background:${on ? toneOf(h.canvas, names).fill : ''}">${hexIcon(h.canvas, names, 12)}${n}</span></button>`;
          }).join('')}</div>` +
          `<div class="mt askfoot">${ss.length} sentence${ss.length === 1 ? '' : 's'} · ${C.sources.length} box${C.sources.length === 1 ? '' : 'es'} · ${canv.size} canvas${canv.size === 1 ? '' : 'es'}</div>` +
          `<div class="kdrow"><button type="button" class="kbtn quiet" data-ask="copy">Copy with citations</button>` +
          (A.a.only === 'built' ? `<button type="button" class="kbtn quiet" data-ask="plans">Include plans</button>` : `<button type="button" class="kbtn quiet" data-ask="built">Built work only</button>`) + `</div>`
          : `<p class="mt">Nothing on your canvases answers that${A.a.only === 'built' ? ' among built work: try Include plans' : ''}.</p>` +
            (A.a.only === 'built' ? `<div class="kdrow"><button type="button" class="kbtn quiet" data-ask="plans">Include plans</button></div>` : '')) + `</div>`;
    }
  }
  const box = `<form class="askbox" data-askform="1"><label class="vh" for="askq">Ask about your projects</label>` +
    `<input id="askq" name="q" autocomplete="off" placeholder="Ask about your projects"${A.busy ? ' disabled' : ''}>` +
    `<div class="askrow"><button type="button" class="askchip${A.only !== false ? ' on' : ''}" data-ask="only" aria-pressed="${A.only !== false}">` +
    `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>Built only</button>` +
    `<span class="mt">All ${(names || []).length || ''} canvases you added</span>` +
    `<button type="submit" class="asksend" aria-label="Ask"${A.busy ? ' disabled' : ''}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg></button></div></form>`;
  const src = A.a && !A.busy && C.sources.length ? `<aside class="kxside" aria-label="Sources"><span class="kxh">Sources</span>` +
    C.sources.map((s) => `<button type="button" class="asksrc${A.cite === s.n ? ' on' : ''}" data-ask-cite="${s.n}">` +
      `<span class="hexn">${hexIcon(s.canvas, names, 30)}<b>${s.n}</b></span><span class="tx"><b>${esc(s.box)}</b>` +
      `<span class="mt">${esc(s.canvas)}${s.under ? ' › ' + esc(s.under) : ''}</span><span class="hexid">${esc(s.id)}</span></span></button>`).join('') +
    (C.read.length ? `<span class="kxh">Also read</span>` + C.read.map((r) => `<div class="asksrc read"><span class="hexn">${hexIcon(r.canvas, names, 22)}</span>` +
      `<span class="tx"><b>${esc(r.box)}</b><span class="mt">${esc(r.canvas)}${r.under ? ' › ' + esc(r.under) : ''}</span></span></div>`).join('') : '') + `</aside>` : '';
  return `<div class="kx"><section class="kxmain askmain">${thread}${box}</section>${src}</div>`;
}

/* The answer as text to paste: each sentence with its number, the boxes under it. */
export function askText(A) {
  const C = citations(A && A.a);
  return ((A.a && A.a.sentences) || []).map((s) => `"${s.text}" [${C.num.get(s.hex)}]`).join('\n') + '\n\n' +
    C.sources.map((s) => `[${s.n}] ${s.canvas}${s.under ? ' > ' + s.under : ''} > ${s.box} (${s.hex})`).join('\n');
}

/* ------------------------------------------------------------ Desks */

function since(iso) { return iso ? String(iso).replace('T', ' ').slice(0, 16) + ' UTC' : ''; }

export function deskCardHtml(d, tracked, names) {
  const mine = tracked.filter((t) => t.desk === d.slug), moved = mine.filter((t) => t.state !== 'same').length;
  const sits = d.sitting || [];
  const who = sits.map((s) => `<li><b>${esc(s.agent)}</b>${s.client && s.client !== s.agent ? ` <span class="mt">(${esc(s.client)})</span>` : ''}` +
    ` <span class="mt">since ${esc(since(s.since))}${s.away ? ' · away' : ''}</span></li>`).join('');
  const row = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return `<article class="kdcard"><header>${hexIcon(d.main_canvas, names, 48)}<div class="kdt"><h3>${esc(d.name)}</h3>` +
    `<span class="mt">v${d.version} · owner ${esc(d.owner)}</span></div>` +
    `<span class="kdsit${sits.length ? ' on' : ''}"><i></i>${sits.length ? (sits.length === 1 ? esc(sits[0].agent) + ' sitting' : sits.length + ' sitting') : 'Nobody sitting'}</span></header>` +
    `<p class="role">${esc(d.role)}</p>` +
    `<div class="kvs">${row('Main canvas', esc(d.main_canvas))}` +
    row('Tracks', `${mine.length} box${mine.length === 1 ? '' : 'es'}${moved ? `, <b class="hot">${moved} changed</b>` : ''}`) +
    (who ? `<div class="kv"><span class="k">Sitting</span><ul class="v">${who}</ul></div>` : row('Sitting', `<span class="mt">tell an agent: sit at the ${esc(d.name)} desk</span>`)) + `</div>` +
    ((d.attached || []).length ? `<div class="kdchips">${d.attached.map((c) => `<span class="kdchip">${hexIcon(c, names, 14)}${esc(c)}</span>`).join('')}</div>` : '') +
    `<footer><button type="button" class="kbtn" data-kd="flow" data-slug="${esc(d.slug)}">Its flow</button>` +
    `<button type="button" class="kbtn quiet" data-kd="edit" data-slug="${esc(d.slug)}">Change</button>` +
    `<button type="button" class="kbtn quiet" data-kd="remove" data-slug="${esc(d.slug)}" data-name="${esc(d.name)}">Remove</button></footer></article>`;
}

/* The form: creating a desk, or changing one (form.slug set). */
export function deskFormHtml(form, canvases) {
  const f = form || {}, att = new Set(f.attached || []);
  const opts = (canvases || []).map((c) => `<option value="${esc(c)}"${f.main_canvas === c ? ' selected' : ''}>${esc(c)}</option>`).join('');
  return `<form class="kdform" data-kdform="1"><h3>${f.slug ? 'Change ' + esc(f.name) : 'Create a desk'}</h3>` +
    `<label>Name<input name="name" value="${esc(f.name || '')}" required placeholder="e.g. Portfolio"></label>` +
    `<label>Role - what its agent is there to do<textarea name="role" rows="2" required placeholder="e.g. Builds my portfolio page from my work">${esc(f.role || '')}</textarea></label>` +
    `<label>Main canvas - where its agent writes<select name="main_canvas" required><option value="">Pick a canvas you added</option>${opts}</select></label>` +
    `<fieldset><legend>Attached canvases - what it reads</legend>${(canvases || []).map((c) =>
      `<label class="chk"><input type="checkbox" name="attached" value="${esc(c)}"${att.has(c) ? ' checked' : ''}>${esc(c)}</label>`).join('') || '<span class="mt">Add canvases with Canvases, at the top</span>'}</fieldset>` +
    `<label>Writes the canvas as <span class="mt">(optional: the desk's own name if left empty)</span><input name="owner" value="${esc(f.owner || '')}"></label>` +
    `<div class="kdrow"><button type="submit" class="kbtn"${f.busy ? ' disabled' : ''}>${f.busy ? 'Sending…' : f.slug ? 'Save changes' : 'Create desk'}</button>` +
    (f.slug ? `<button type="button" class="kbtn quiet" data-kd="cancel">Cancel</button>` : '') + `</div></form>`;
}

export function kdDesksHtml(ov, form, canvases, said) {
  if (!ov) return '<div class="status">Asking Knowledge Desk…</div>';
  const tracked = ov.tracking || [];
  return `<section class="kd">` + (said ? `<p class="said">${esc(said)}</p>` : '') +
    `<div class="kdgrid">${(ov.desks || []).map((d) => deskCardHtml(d, tracked, canvases)).join('') ||
      `<p class="muted">${ov.up ? 'No desks yet: create one here.' : esc(ov.note || 'Knowledge Desk could not be read.')}</p>`}` +
    deskFormHtml(form, canvases) + `</div></section>`;
}

/* What the form holds, as Knowledge Desk takes it. */
export function formBody(fd, slug) {
  const body = { name: (fd.get('name') || '').trim(), role: (fd.get('role') || '').trim(),
    main_canvas: fd.get('main_canvas') || '', attached: fd.getAll('attached'), owner: (fd.get('owner') || '').trim() };
  if (!body.owner) delete body.owner;
  return slug ? { desk: slug, ...body } : body;
}

/* ------------------------------------------------------------ Tracking */

const STATE = { same: 'as read', changed: 'changed since read', gone: 'gone from its canvas' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()]; };

export function kdTrackingHtml(ov, names) {
  if (!ov) return '<div class="status">Asking Knowledge Desk…</div>';
  const all = ov.tracking || [], by = new Map();
  for (const t of all) { if (!by.has(t.desk)) by.set(t.desk, []); by.get(t.desk).push(t); }
  const changed = all.filter((t) => t.state !== 'same').length;
  const last = all.map((t) => t.read_at).filter(Boolean).sort().pop();
  const tile = (v, k) => `<div class="kdtile"><b>${esc(v)}</b><span>${esc(k)}</span></div>`;
  const desks = [...by.entries()].map(([slug, rows]) => {
    rows = rows.slice().sort((a, b) => (a.state === 'same') - (b.state === 'same') || String(a.address).localeCompare(b.address));
    const name = rows[0].desk_name || slug, moved = rows.filter((t) => t.state !== 'same').length;
    return `<article class="kdlist"><header><b>${moved ? `Changed since ${esc(name)} last read them` : `${esc(name)} tracks`}</b><span class="mt">${rows.length} tracked${moved ? ` · ${moved} changed` : ''}</span></header>` +
      rows.map((t) => {
        const path = String(t.address || '').split(' > ').map(strip);
        return `<div class="kdli ${esc(t.state)}">${hexIcon(t.canvas, names, 26)}<span class="tx"><b>${esc(path[path.length - 1] || t.hex)}</b>` +
          `<span class="mt">${esc(t.canvas)}${path.length > 1 ? ' › ' + esc(path.slice(0, -1).join(' › ')) : ''}</span></span>` +
          `<span class="st">${esc(STATE[t.state] || t.state)}</span></div>`;
      }).join('') + `</article>`;
  }).join('');
  const who = [...by.entries()].map(([slug, rows]) => `<div class="kv"><span class="v">${esc(rows[0].desk_name || slug)}</span>` +
    `<span class="k">${rows.length} box${rows.length === 1 ? '' : 'es'}, ${new Set(rows.map((r) => r.canvas)).size} canvas${new Set(rows.map((r) => r.canvas)).size === 1 ? '' : 'es'}</span></div>`).join('');
  const idx = (ov.canvases || []).map((c) => `<div class="kv"><span class="v">${hexIcon(c.canvas, names, 14)} ${esc(c.canvas)}</span><span class="k">${c.boxes} boxes · ${esc(dayOf(c.updated_at))}</span></div>`).join('');
  return `<div class="kx"><section class="kxmain">` +
    `<div class="kdtiles">${tile(String(all.length), 'boxes tracked')}${tile(String(changed), 'changed since last read')}${tile(last ? dayOf(last) : '-', 'last read')}</div>` +
    (desks || '<p class="muted">No desk tracks a box yet: a box is tracked when the agent sitting at a desk cites it in a text it checks.</p>') +
    `</section><aside class="kxside">` +
    (who ? `<div class="kdcard slim"><span class="kxh">Who tracks what</span><div class="kvs">${who}</div></div>` : '') +
    `<div class="kdnote2"><i></i><span>A desk tracks the boxes its agent cites. When a box's words change, the desk sees it the next time it sits down; on the Main map these boxes carry a ring.</span></div>` +
    `<div class="kdcard slim"><span class="kxh">Knowledge Desk's index</span>${idx ? `<div class="kvs">${idx}</div>` : '<p class="muted">Nothing indexed yet.</p>'}` +
    `<p class="mt">It holds exactly the canvases you added.</p></div></aside></div>`;
}

/* ------------------------------------------------------------ the Tracking layer on the Main map */

/* Each box on the map that a desk tracks -> the tracked rows on it. A box is
   found by its canvas, its totem and its name, as the row's address gives them. */
export function trackedOn(reg, rows) {
  const out = new Map();
  for (const t of rows || []) {
    const segs = String(t.address || '').split(' > ').map(strip).filter(Boolean);
    if (!segs.length) continue;
    const box = segs[segs.length - 1], totem = segs[0];
    for (const id of Object.keys(reg)) {
      const x = reg[id];
      if (x.kind !== 'box' || x.name !== box) continue;
      if (!x.canvas || reg[x.canvas].name !== t.canvas) continue;
      if (x.totem && reg[x.totem].name !== totem) continue;
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(t);
    }
  }
  return out;
}

/* What a hexagon on the map says about tracking: its own rows, or the count
   of tracked boxes under it. */
export function trackMark(id, under, on) {
  const rows = [];
  for (const b of [id].concat(under)) for (const t of on.get(b) || []) rows.push(t);
  if (!rows.length) return null;
  const moved = rows.some((t) => t.state !== 'same');
  const desks = [...new Set(rows.map((t) => t.desk_name || t.desk))];
  return { moved, n: rows.length, own: on.has(id), label: on.has(id) ? 'tracked by ' + desks.join(', ') + (moved ? ' · changed' : '')
    : rows.length + ' tracked' + (moved ? ' · changed' : '') };
}

/* ------------------------------------------------------------ Flows for the desks you created (K5) */

const ACTOR = { code: 'Knowledge Desk', agent: 'the agent at the desk', user: 'you' };
export const NEW_STEP = {
  read_main: () => ({ step: 'read_main' }),
  gather: () => ({ step: 'gather', built_only: true }),
  agent: () => ({ step: 'agent', mode: 'draft', instruction: '' }),
  check_citations: () => ({ step: 'check_citations', tries: 3 }),
  stop: () => ({ step: 'stop', question: '' }),
  check_write: () => ({ step: 'check_write', tries: 3 }),
};

export function addFlowStep(steps, kind) { return NEW_STEP[kind] ? steps.concat([NEW_STEP[kind]()]) : steps; }
export function moveFlowStep(steps, i, by) {
  const j = i + by;
  if (j < 0 || j >= steps.length) return steps;
  const out = steps.slice(); [out[i], out[j]] = [out[j], out[i]]; return out;
}
export function removeFlowStep(steps, i) { return steps.filter((_, k) => k !== i); }
export function setFlowField(steps, i, field, value) {
  return steps.map((s, k) => (k === i ? { ...s, [field]: field === 'tries' ? Math.max(1, Math.min(5, +value || 1)) : field === 'built_only' ? !!value : value } : s));
}

/* A flow to start from: read, gather, draft, check, your stop, write, check the write. */
export function starterFlow() {
  return [{ step: 'read_main' }, { step: 'gather', built_only: true },
    { step: 'agent', mode: 'draft', instruction: '' }, { step: 'check_citations', tries: 3 },
    { step: 'stop', question: 'Write this to the Main canvas?' },
    { step: 'agent', mode: 'write', instruction: 'Put the approved draft on the Main canvas' }, { step: 'check_write', tries: 3 }];
}

function stepRow(s, i, n, catalogue) {
  const c = catalogue[s.step] || { name: s.step, actor: 'code', does: '' };
  let fields = '';
  if (s.step === 'agent') fields = `<label>What the agent does<textarea rows="2" data-kf-field="instruction" data-i="${i}" placeholder="e.g. Write the skills section from these sentences">${esc(s.instruction || '')}</textarea></label>` +
    `<label>It<select data-kf-field="mode" data-i="${i}"><option value="draft"${s.mode !== 'write' ? ' selected' : ''}>drafts a text</option><option value="write"${s.mode === 'write' ? ' selected' : ''}>writes the approved draft on the Main canvas</option></select></label>`;
  if (s.step === 'stop') fields = `<label>The question it asks you<input data-kf-field="question" data-i="${i}" value="${esc(s.question || '')}"></label>`;
  if (s.step === 'gather') fields = `<label class="chk"><input type="checkbox" data-kf-field="built_only" data-i="${i}"${s.built_only !== false ? ' checked' : ''}>built work only</label>`;
  if (s.step === 'check_citations' || s.step === 'check_write') fields = `<label class="inl">Sends problems back up to<input type="number" min="1" max="5" data-kf-field="tries" data-i="${i}" value="${esc(s.tries || 3)}"> times</label>`;
  return `<li class="kfstep a-${esc(c.actor)}"><div class="kfhead"><span class="num">${i + 1}</span><b>${esc(c.name)}</b>` +
    `<span class="mt">${esc(ACTOR[c.actor] || c.actor)}</span><span class="kfmove">` +
    `<button type="button" data-kf="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>` +
    `<button type="button" data-kf="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>` +
    `<button type="button" data-kf="remove" data-i="${i}" aria-label="Remove step">×</button></span></div>` +
    (fields ? `<div class="kffields">${fields}</div>` : `<p class="mt">${esc(c.does)}</p>`) + `</li>`;
}

const RUNSTATE = { running: 'running', waiting_agent: 'waiting on the agent', waiting_user: 'waiting on your yes',
  done: 'done', stopped: 'you said no', given_up: 'gave up' };

export function runsHtml(runs) {
  if (!runs || !runs.length) return '<p class="muted">No runs yet: tell the agent sitting at the desk to run a flow.</p>';
  return `<ul class="kfruns">` + runs.map((r) => {
    const w = r.waiting || {};
    return `<li class="${esc(r.state)}"><div><b>${esc(r.flow)}</b> <span class="mt">v${r.version} · ${esc(r.task)}</span></div>` +
      `<div class="mt">${esc(RUNSTATE[r.state] || r.state)}${r.step != null ? ' · step ' + (r.step + 1) : ''}${r.said ? ' · ' + esc(r.said) : ''}</div>` +
      (r.state === 'waiting_user' ? `<div class="kfask"><span>${esc(w.question || '')}</span>` +
        `<button type="button" class="kbtn" data-kf="yes" data-run="${esc(r.id)}">Yes</button>` +
        `<button type="button" class="kbtn quiet" data-kf="no" data-run="${esc(r.id)}">No</button></div>` : '') + `</li>`;
  }).join('') + `</ul>`;
}

const BADGE = { code: 'Knowledge Desk', agent: 'agent', user: 'you' };

/* A flow as it reads: each step, who does it, and the user's own words in it. */
export function flowReadHtml(f, cat, deskName, runs) {
  const steps = f.steps || [], ran = (runs || []).some((r) => r.flow === f.name && r.version === f.version && r.state === 'done');
  const items = steps.map((s, i) => {
    const c = cat[s.step] || { name: s.step, actor: 'code', does: '' };
    const note = s.step === 'gather' ? (s.built_only !== false ? 'built work only' : 'plans too') : s.step === 'agent' ? (s.mode === 'write' ? 'write' : 'draft')
      : s.tries ? `${s.tries} tries` : '';
    const said = s.step === 'agent' ? s.instruction : s.step === 'stop' ? s.question : '';
    return `<li class="kfr${ran ? ' ran' : ''}"><span class="kfn">${i + 1}</span><div class="kfb"><div class="kfh"><b>${esc(c.name)}</b>` +
      `<span class="kfa a-${esc(c.actor)}">${esc(BADGE[c.actor] || c.actor)}</span>${note ? `<span class="mt">${esc(note)}</span>` : ''}</div>` +
      (said ? `<q class="kfq">${esc(said)}</q>` : `<span class="mt">${esc(c.does)}</span>`) + `</div></li>`;
  }).join('');
  return `<h2 class="kft">${esc(f.name)}</h2><p class="kfm">${esc(deskName)} desk · version ${f.version} · ${steps.length} step${steps.length === 1 ? '' : 's'}</p>` +
    `<ol class="kfread">${items}</ol>`;
}

/* kf: { desks, desk, data: {steps, rules, flows, runs} | {error}, name, steps, editing, problems, said, busy } */
export function kfHtml(kf) {
  const ds = (kf && kf.desks) || [];
  const chips = ds.map((d) => `<button type="button" class="kfdesk${kf.desk === d.slug ? ' on' : ''}" data-kf="desk" data-slug="${esc(d.slug)}" aria-pressed="${kf.desk === d.slug}">${esc(d.name)}</button>`).join('');
  let body;
  if (!ds.length) body = '<p class="muted">Create a desk under Desks first.</p>';
  else if (!kf.desk) body = '<p class="muted">Pick a desk.</p>';
  else if (!kf.data) body = '<p class="muted">Asking Knowledge Desk…</p>';
  else if (kf.data.error) body = `<p class="muted">${esc(kf.data.error)}</p>`;
  else if (!kf.editing && kf.name) {
    const cat = kf.data.steps || {}, all = kf.data.flows || [], f = all.find((x) => x.name === kf.name);
    const deskName = (ds.find((d) => d.slug === kf.desk) || {}).name || kf.desk;
    const flows = all.length > 1 ? `<div class="wf-bar">${all.map((x) => `<button type="button" class="wf-pick${kf.name === x.name ? ' on' : ''}" data-kf="open" data-name="${esc(x.name)}">${esc(x.name)}<span class="wf-ver">v${x.version}</span></button>`).join('')}</div>` : '';
    return `<div class="kx"><section class="kxmain"><div class="kfdesks">${chips}</div>${flows}` +
      (f ? flowReadHtml(f, cat, deskName, kf.data.runs) : '') + (kf.said ? `<p class="said">${esc(kf.said)}</p>` : '') +
      `<div class="kdrow"><button type="button" class="kbtn" data-kf="edit">Edit steps</button><button type="button" class="kbtn quiet" data-kf="new">New flow</button></div></section>` +
      `<aside class="kxside"><div class="kdcard slim"><span class="kxh">Runs</span>${runsHtml(kf.data.runs)}</div>` +
      `<div class="kdsoft"><span class="kxh">Every flow keeps these rules</span><ol class="kfrules2">${(kf.data.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div></aside></div>`;
  } else {
    const cat = kf.data.steps || {}, steps = kf.steps || [];
    const flows = (kf.data.flows || []).map((f) => `<button type="button" class="wf-pick${kf.name === f.name ? ' on' : ''}" data-kf="open" data-name="${esc(f.name)}">${esc(f.name)}<span class="wf-ver">v${f.version}</span></button>`).join('');
    body = `<div class="wf-bar">${flows}<button type="button" class="wf-pick" data-kf="new">+ New flow</button></div>` +
      (kf.name != null ? `<div class="kfedit"><label class="kfname">Flow name<input data-kf-field="name" value="${esc(kf.name)}" placeholder="e.g. Build my portfolio page"></label>` +
        `<ol class="kfsteps">${steps.map((s, i) => stepRow(s, i, steps.length, cat)).join('')}</ol>` +
        `<div class="kfadd"><select data-kf-add="1"><option value="">+ Add a step…</option>${Object.entries(cat).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join('')}</select></div>` +
        ((kf.problems || []).length ? `<ul class="kfprob">${kf.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
        (kf.said ? `<p class="said">${esc(kf.said)}</p>` : '') +
        `<div class="kdrow"><button type="button" class="kbtn" data-kf="save"${kf.busy ? ' disabled' : ''}>${kf.busy ? 'Saving…' : 'Save flow'}</button>` +
        `<button type="button" class="kbtn quiet" data-kf="done">Done editing</button></div>` +
        `<details class="kfrules"><summary>Rules no flow may break</summary><ul>${(kf.data.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details></div>` : '') +
      `<h2>Runs</h2>` + runsHtml(kf.data.runs);
  }
  return `<section class="kd"><div class="kfdesks">${chips}</div>${body}</section>`;
}

/* ------------------------------------------------------------ Monitoring (K6) */

const SOURCE = { 'claude-code': 'Claude Code', antigravity: 'Antigravity', 'knowledge-desk': "Knowledge Desk's tools" };
const num = (n) => (n == null ? '' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

export function monitoringHtml(mon) {
  if (!mon) return '<div class="status">Asking Knowledge Desk…</div>';
  if (!mon.up) return `<section class="kd"><h2>Monitoring</h2><p class="muted">${esc(mon.note || 'Knowledge Desk could not be read.')}</p></section>`;
  const sess = (mon.sessions || []).map((s) => `<li><div><b>${esc(s.desk)}</b> <span class="mt">${esc(SOURCE[s.source] || s.source)} · ${esc(s.session)}</span></div>` +
    `<div class="mt">${s.model_calls} model calls · ${num(s.input_tokens)} in, ${num(s.output_tokens)} out, ${num(s.cache_read)} cache read` +
    `${s.cost_usd != null ? ` · about $${s.cost_usd.toFixed(2)}` : s.model_calls ? ' · no cost (no model named)' : ''} · ${s.tool_calls} tool calls` +
    `${s.errors ? ` · <b class="hot">${s.errors} failed</b>` : ''} · ${esc(String(s.first || '').slice(11, 16))}–${esc(String(s.last || '').slice(11, 16))} UTC</div></li>`).join('');
  const calls = (mon.calls || []).slice(0, 40).map((c) => `<li class="${c.ok === false ? 'bad' : ''}"><span class="nm">${esc(c.kind === 'model' ? (c.model || 'model call') : c.name)}</span>` +
    `<span class="mt">${esc(c.desk)} · ${esc(SOURCE[c.source] || c.source)}${c.kind === 'model' ? ` · ${num(c.input_tokens)} in, ${num(c.output_tokens)} out` : ''}` +
    `${c.duration_ms != null ? ` · ${c.duration_ms} ms` : ''}${c.error ? ' · ' + esc(c.error.slice(0, 140)) : ''} · ${esc(String(c.at || '').slice(11, 19))}</span></li>`).join('');
  const tasks = (mon.tasks || []).slice(0, 30).map((t) => `<li><span class="nm">${esc(t.caller || 'someone')} → ${esc(t.desk)}: ${esc(t.job)}</span>` +
    `<span class="mt">${esc(t.state)} · ${esc(String(t.started_at || '').replace('T', ' ').slice(0, 16))}${t.said ? ' · ' + esc(String(t.said).slice(0, 120)) : ''}</span></li>`).join('');
  return `<section class="kd"><h2>Agents at their desks</h2>` +
    (sess ? `<ul class="trk mon">${sess}</ul>` : '<p class="muted">No agent has sat at a desk in the last week.</p>') +
    `<h2>Calls lately</h2>` + (calls ? `<ul class="trk mon calls">${calls}</ul>` : '<p class="muted">None yet.</p>') +
    `<h2>A2A between desks</h2>` + (tasks ? `<ul class="trk mon">${tasks}</ul>` : '<p class="muted">No tasks yet.</p>') +
    `<p class="muted">${esc(mon.note || '')}</p></section>`;
}
