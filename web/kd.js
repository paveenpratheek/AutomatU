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

/* ------------------------------------------------------------ Monitoring */

export function kdMonitoringHtml() {
  return `<section class="kd"><h2>Monitoring</h2>` +
    `<p>Two things will show here, and neither is built yet - they come with Knowledge Desk's K6:</p>` +
    `<ul class="plain"><li><b>A2A between desks</b> - every message, who sent it, its task and its state.</li>` +
    `<li><b>Tracing</b> - every model and tool call each agent makes, with its time, tokens, cost and errors.</li></ul>` +
    `<p class="muted">Until then, each hosted desk's runs are under Desks, step by step.</p></section>`;
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
