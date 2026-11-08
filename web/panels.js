/*
 * The two panels beside the map.
 *
 * Canvas filter: every section of the canvas with how many regions sit in
 * it; switching one off fades its cluster. Sections no code has reached yet
 * are listed apart - the plan that is not built, or not recognised, yet.
 *
 * Not yet placed: regions the canvas has not caught up with, grouped by the
 * sections they would join (their nearest group), so the user can see which
 * section to update or which new one to make (t-3f83db677d).
 */
import { state, applyHidden, short, esc } from './map.js';

const $ = (id) => document.getElementById(id);

function filter() {
  const { run, places } = state.map;
  const count = {};
  for (const p of places) for (const s of p.sections) count[s] = (count[s] || 0) + 1;
  const sections = run.sections.length ? run.sections : Object.keys(count);
  const withCode = sections.filter((s) => count[s]);
  const without = sections.filter((s) => !count[s]);
  const row = (s) => {
    const off = state.hidden.has(s);
    return `<li><button type="button" class="chip${off ? ' off' : ''}" data-section="${esc(s)}" aria-pressed="${!off}" title="${esc(s)}">` +
      `<span class="dot" style="background:${state.colour[s]}"></span><span class="name">${esc(short(s))}</span>` +
      `<span class="n">${count[s]}</span></button></li>`;
  };
  $('filter').innerHTML =
    `<h2>Canvas filter</h2><ul class="chips">${withCode.map(row).join('')}</ul>` +
    (without.length ? `<h3>No code yet <span class="n">${without.length}</span></h3><ul class="plain">${without.map((s) => `<li title="${esc(s)}">${esc(short(s))}</li>`).join('')}</ul>` : '');
  for (const b of $('filter').querySelectorAll('button.chip')) {
    b.addEventListener('click', () => {
      const s = b.dataset.section;
      if (state.hidden.has(s)) state.hidden.delete(s); else state.hidden.add(s);
      b.classList.toggle('off');
      b.setAttribute('aria-pressed', String(!state.hidden.has(s)));
      applyHidden();
    });
  }
}

function waiting() {
  const wait = state.map.places.filter((p) => !p.sections.length);
  const groups = {};
  for (const p of wait) {
    const k = (p.near && p.near.length ? p.near : [p.best]).join(' | ');
    (groups[k] = groups[k] || []).push(p);
  }
  const order = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  $('waiting').innerHTML = `<h2>Not yet placed <span class="n">${wait.length}</span></h2>` +
    (wait.length ? '<p class="hint">Grouped by the sections each would join. Update one of them, or make a new section, for these to be placed.</p>' : '<p class="hint">Every region is placed.</p>') +
    order.map(([k, ps]) => `<details><summary><span class="near">${k.split(' | ').map((s) => `<span class="dot" style="background:${state.colour[s] || 'var(--ink-2)'}"></span>${esc(short(s))}`).join(' + ')}</span> <span class="n">${ps.length}</span></summary>` +
      `<ul class="regions">${ps.sort((a, b) => b.score - a.score).map((p) => `<li><code>${esc(p.region)}</code> <span class="num">${p.score.toFixed(2)} · lead ${p.margin.toFixed(3)}</span></li>`).join('')}</ul></details>`).join('');
}

window.addEventListener('map-loaded', () => { filter(); waiting(); });
