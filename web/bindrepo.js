/*
 * Linking a repository to the canvas that plans it, from the canvas's hex
 * (box 31). The panel lists the repositories the canvas plans, each with its
 * plan totem, and a form links another: a git repository found beside the ones
 * AutomatU knows, or a folder typed in, and the plan totem picked from the
 * canvas's own totems, so its name cannot be mistyped. The server binds it as
 * automatu bind does (t-83634eede9): moving a repository bound elsewhere needs
 * the user's confirm, as --replace does. No DOM here, so it is tested in Node.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* A folder written one way, as the server keys it: forward slashes, no
   trailing slash, the drive letter in capitals. */
export const folderKey = (p) => String(p || '').trim().replace(/^"(.*)"$/, '$1').replace(/\\/g, '/').replace(/\/+$/, '').replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ':');

const where = (r) => r.canvas + (r.totem ? ' > ' + r.totem : '');

/* The repositories this canvas plans. */
export function plannedHtml(repos) {
  if (!repos || !repos.length) return '<p class="muted">No repository yet: link one below, and its code is placed under its plan totem\'s boxes.</p>';
  return `<ul class="bindlist">${repos.map((r) => `<li><b>${esc(r.name)}</b><span class="mt">${r.totem ? 'plan totem ' + esc(r.totem) : 'every box is its plan'}</span></li>`).join('')}</ul>`;
}

/* The repositories the form offers: those not already planned here, then the
   ones planned here (to move to another of its totems), each saying where it
   is bound now and whether it has a GitX record. */
export function repoOptions(near, canvas) {
  const here = (r) => r.canvas === canvas;
  return (near || []).slice().sort((a, b) => here(a) - here(b)).map((r) => ({
    value: r.repo,
    label: r.name + (r.canvas ? ` - linked to ${where(r)}` : '') + (r.gitx ? '' : ' - no GitX record'),
  }));
}

/* The form, with what was picked or typed kept in st across redraws. */
export function bindFormHtml(canvas, totems, near, st) {
  const f = st || {};
  const opts = repoOptions(near, canvas).map((o) => `<option value="${esc(o.value)}"${f.repo === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  const tots = (totems || []).map((t) => `<option value="${esc(t)}"${f.totem === t ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<form class="kdform bindform" data-bindform="1">` +
    `<label>Repository<select name="repo"><option value="">${near ? 'Pick a repository' : 'Finding repositories…'}</option>${opts}</select></label>` +
    `<label>or its folder<input name="path" value="${esc(f.path || '')}" autocomplete="off" spellcheck="false" placeholder="E:\\Coding CLI\\Project X"></label>` +
    `<label>Plan totem - its code is placed under these boxes<select name="totem"><option value="">Pick a totem of ${esc(canvas)}</option>${tots}</select></label>` +
    `<div class="kdrow"><button type="submit" class="kbtn"${f.busy ? ' disabled' : ''}>${f.busy ? 'Linking…' : 'Link repository'}</button></div></form>` +
    (f.said ? `<p class="said">${esc(f.said)}</p>` : '');
}

/* What the form asks for: the repository (a typed folder wins over the pick),
   the canvas and its totem; a problem to say instead of sending; or the
   question to confirm first when the repository is bound somewhere else now. */
export function bindAsk(canvas, f, near) {
  const repo = folderKey(f.path) || f.repo || '';
  if (!repo) return { problem: 'Pick a repository, or type its folder.' };
  if (!f.totem) return { problem: `Pick the totem of ${canvas} that plans it.` };
  const now = (near || []).find((r) => folderKey(r.repo) === repo);
  const ask = { repo, canvas, totem: f.totem, replace: false };
  if (!now || !now.canvas) return { ask };
  if (now.canvas === canvas && now.totem === f.totem) return { problem: `${now.name} is already linked to ${where(now)}.` };
  if (now.canvas === canvas && !now.totem) return { ask };   // naming the plan totem of a binding with none needs no move
  return { ask, confirm: `${now.name} is linked to ${where(now)} now. Move it to ${canvas} > ${f.totem}? The change is kept in its binding log.` };
}

/* A refusal the server gives when the repository is bound elsewhere, found
   only once sent (a folder typed in that the list did not know). */
export const needsMove = (problem) => /already bound to the canvas/.test(String(problem || ''));

/* What the panel says once the server answered. */
export function saidOf(j) {
  if (j.problem) return 'Not linked: ' + j.problem;
  if (!j.changed) return `${j.repo.split('/').pop()} was already linked that way.`;
  return `${j.repo.split('/').pop()} linked to ${j.canvas}${j.totem ? ' > ' + j.totem : ''}${j.was ? ' (was ' + j.was + ')' : ''}. Its first map is made in a few seconds; then its code is on the Code tab.`;
}
