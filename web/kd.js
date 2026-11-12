/*
 * The Knowledge Desk tab (box 25, t-8551b11d21): the junction between AutomatU
 * and Work Desks, shown in four sections - Desks, Flows, Tracking, Monitoring.
 * Everything here is read from Knowledge Desk (/api/kd); creating, changing and
 * removing a desk is the user's act passed on to it (t-d41a20184d). The Flows
 * section is the Workflows editor, and the hosted desks' cards and runs sit
 * under Desks; both are drawn by their own modules.
 *
 * The Tracking layer (t-799e6f44c2): the boxes a desk tracks, found on the Main
 * map from their canvas and address, ringed in orange there.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lastOf = (address) => String(address || '').split(' > ').pop();
const strip = (s) => String(s).replace(/\s*\((totem|sub-totem)\)\s*$/, '').trim();

export const SECTIONS = [
  ['desks', 'Desks', 'The desks you created, who sits at each, and the desks with an agent hosted'],
  ['flows', 'Flows', "Arrange each desk job's flow, and what each desk may do"],
  ['tracking', 'Tracking', 'The boxes each desk tracks, and what Knowledge Desk has indexed'],
  ['monitoring', 'Monitoring', 'A2A between desks, and tracing each agent\'s calls'],
];

export function kdBarHtml(sec, ov) {
  const changed = ((ov && ov.tracking) || []).filter((t) => t.state !== 'same').length;
  return `<nav class="kdbar" aria-label="Knowledge Desk sections">` + SECTIONS.map(([k, label, why]) =>
    `<button type="button" class="kdsec${sec === k ? ' on' : ''}" data-kdsec="${k}" aria-pressed="${sec === k}" title="${esc(why)}">${esc(label)}` +
    (k === 'tracking' && changed ? `<span class="badge">${changed}</span>` : '') + `</button>`).join('') +
    (ov && !ov.up && ov.note ? `<span class="kdnote">${esc(ov.note)}</span>` : '') + `</nav>`;
}

/* ------------------------------------------------------------ Desks */

function since(iso) { return iso ? String(iso).replace('T', ' ').slice(0, 16) + ' UTC' : ''; }

export function deskCardHtml(d, tracked) {
  const mine = tracked.filter((t) => t.desk === d.slug), moved = mine.filter((t) => t.state !== 'same').length;
  const who = (d.sitting || []).map((s) => `<li><b>${esc(s.agent)}</b>${s.client && s.client !== s.agent ? ` <span class="mt">(${esc(s.client)})</span>` : ''}` +
    ` <span class="mt">since ${esc(since(s.since))}${s.away ? ' · away' : ''}</span></li>`).join('');
  return `<article class="kdcard"><header><h3>${esc(d.name)}</h3><span class="mt">version ${d.version}</span></header>` +
    `<p class="role">${esc(d.role)}</p>` +
    `<dl><dt>Main canvas</dt><dd>${esc(d.main_canvas)} <span class="mt">written as ${esc(d.owner)}</span></dd>` +
    `<dt>Attached</dt><dd>${esc((d.attached || []).join(', ') || 'none')}</dd>` +
    `<dt>Sitting</dt><dd>${who ? `<ul>${who}</ul>` : '<span class="mt">nobody - tell an agent: sit at the ' + esc(d.name) + ' desk</span>'}</dd>` +
    `<dt>Tracks</dt><dd>${mine.length} box${mine.length === 1 ? '' : 'es'}${moved ? ` · <b class="hot">${moved} changed since read</b>` : ''}</dd></dl>` +
    `<footer><button type="button" class="kbtn quiet" data-kd="edit" data-slug="${esc(d.slug)}">Change</button>` +
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
  return `<section class="kd"><h2>Desks you created</h2>` + (said ? `<p class="said">${esc(said)}</p>` : '') +
    `<div class="kdgrid">${(ov.desks || []).map((d) => deskCardHtml(d, tracked)).join('') ||
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

export function kdTrackingHtml(ov) {
  if (!ov) return '<div class="status">Asking Knowledge Desk…</div>';
  const by = new Map();
  for (const t of ov.tracking || []) { if (!by.has(t.desk)) by.set(t.desk, []); by.get(t.desk).push(t); }
  const desks = [...by.entries()].map(([slug, rows]) => {
    rows = rows.slice().sort((a, b) => (a.state === 'same') - (b.state === 'same') || String(a.address).localeCompare(b.address));
    return `<article class="kdcard"><header><h3>${esc(rows[0].desk_name || slug)}</h3><span class="mt">${rows.length} tracked</span></header><ul class="trk">` +
      rows.map((t) => `<li class="${t.state}"><span class="nm">${esc(lastOf(t.address) || t.hex)}</span>` +
        `<span class="mt">${esc(t.canvas)} · ${esc(STATE[t.state] || t.state)}</span></li>`).join('') + `</ul></article>`;
  }).join('');
  const idx = (ov.canvases || []).map((c) => `<li><span class="nm">${esc(c.canvas)}</span><span class="mt">${c.boxes} boxes · changed ${esc(since(c.updated_at))}</span></li>`).join('');
  return `<section class="kd"><h2>Boxes the desks track</h2>` +
    (desks ? `<div class="kdgrid">${desks}</div>` : '<p class="muted">No desk tracks a box yet: a box is tracked when the agent sitting at a desk cites it in a text it checks.</p>') +
    `<p class="muted">On the Main map these boxes are ringed in orange - the Tracking layer.</p>` +
    `<h2>Knowledge Desk's index</h2>` +
    (idx ? `<ul class="trk idx">${idx}</ul>` : '<p class="muted">Nothing indexed yet.</p>') +
    `<p class="muted">It holds exactly the canvases you added with Canvases, at the top.</p></section>`;
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

/* kf: { desks, desk, data: {steps, rules, flows, runs} | {error}, name, steps, problems, said, busy } */
export function kfHtml(kf) {
  const ds = (kf && kf.desks) || [];
  const chips = ds.map((d) => `<button type="button" class="wf-pick${kf.desk === d.slug ? ' on' : ''}" data-kf="desk" data-slug="${esc(d.slug)}">${esc(d.name)}</button>`).join('');
  let body;
  if (!ds.length) body = '<p class="muted">Create a desk under Desks first.</p>';
  else if (!kf.desk) body = '<p class="muted">Pick a desk.</p>';
  else if (!kf.data) body = '<p class="muted">Asking Knowledge Desk…</p>';
  else if (kf.data.error) body = `<p class="muted">${esc(kf.data.error)}</p>`;
  else {
    const cat = kf.data.steps || {}, steps = kf.steps || [];
    const flows = (kf.data.flows || []).map((f) => `<button type="button" class="wf-pick${kf.name === f.name ? ' on' : ''}" data-kf="open" data-name="${esc(f.name)}">${esc(f.name)}<span class="wf-ver">v${f.version}</span></button>`).join('');
    body = `<div class="wf-bar">${flows}<button type="button" class="wf-pick" data-kf="new">+ New flow</button></div>` +
      (kf.name != null ? `<div class="kfedit"><label class="kfname">Flow name<input data-kf-field="name" value="${esc(kf.name)}" placeholder="e.g. Build my portfolio page"></label>` +
        `<ol class="kfsteps">${steps.map((s, i) => stepRow(s, i, steps.length, cat)).join('')}</ol>` +
        `<div class="kfadd"><select data-kf-add="1"><option value="">+ Add a step…</option>${Object.entries(cat).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join('')}</select></div>` +
        ((kf.problems || []).length ? `<ul class="kfprob">${kf.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
        (kf.said ? `<p class="said">${esc(kf.said)}</p>` : '') +
        `<div class="kdrow"><button type="button" class="kbtn" data-kf="save"${kf.busy ? ' disabled' : ''}>${kf.busy ? 'Saving…' : 'Save flow'}</button></div>` +
        `<details class="kfrules"><summary>Rules no flow may break</summary><ul>${(kf.data.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details></div>` : '') +
      `<h2>Runs</h2>` + runsHtml(kf.data.runs);
  }
  return `<section class="kd"><h2>Flows of the desks you created</h2><div class="wf-bar">${chips}</div>${body}</section>`;
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
