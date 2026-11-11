/*
 * The Canvases sheet (box 24, t-4fb5a8ff46): every canvas NoteX has, and
 * whether it is in AutomatU. Only the canvases the user adds are on the Main
 * map, in search, and in Knowledge Desk's index. The rules canvas is never
 * added, and a canvas a repository is bound to stays while the binding does.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const repoName = (r) => String(r).split('/').pop();

/* In AutomatU first, then the rest, each in the order NoteX gives (newest first). */
export function ordered(list) {
  const rows = (list || []).filter((c) => c && c.name);
  return rows.filter((c) => c.added).concat(rows.filter((c) => !c.added));
}

/* What one row offers: add, remove, or nothing - with why. */
export function action(c) {
  if (c.rules) return { kind: 'none', why: 'the rules canvas: only your own words, never added' };
  if (c.added && c.repos && c.repos.length) return { kind: 'none', why: 'plans ' + c.repos.map(repoName).join(', ') + ': stays while bound' };
  return c.added ? { kind: 'remove', why: '' } : { kind: 'add', why: '' };
}

export function canvasListHtml(answer, { busy = '', said = '', failed = '' } = {}) {
  if (failed) return `<h3>Canvases</h3><p class="muted">Could not read NoteX's canvases: ${esc(failed)}</p>`;
  if (!answer) return `<h3>Canvases</h3><p class="muted">Reading NoteX's canvases…</p>`;
  const rows = ordered(answer.canvases);
  const n = rows.filter((c) => c.added).length;
  const row = (c) => {
    const a = action(c), bits = [];
    if (c.added) bits.push('in AutomatU');
    if (c.missing) bits.push('NoteX no longer has it');
    if (c.agent) bits.push('agent canvas');
    if (a.why) bits.push(a.why);
    const btn = a.kind === 'none' ? ''
      : `<button type="button" class="cbtn${a.kind === 'remove' ? ' quiet' : ''}" data-canvas-${a.kind}="${esc(c.name)}"${busy ? ' disabled' : ''}>` +
        `${busy === c.name ? (a.kind === 'add' ? 'Adding…' : 'Removing…') : (a.kind === 'add' ? 'Add' : 'Remove')}</button>`;
    return `<div class="cv${c.added ? ' on' : ''}"><div class="cvn"><b>${esc(c.name)}</b><span class="mt">${esc(bits.join(' · '))}</span></div>${btn}</div>`;
  };
  return `<h3>Canvases in AutomatU · ${n}</h3>` + (said ? `<p class="said">${esc(said)}</p>` : '') +
    (rows.length ? rows.map(row).join('') : '<p class="muted">NoteX has no canvases yet.</p>') +
    `<p class="muted foot">Only the canvases you add are on the map, in search, and in Knowledge Desk's index.</p>`;
}
