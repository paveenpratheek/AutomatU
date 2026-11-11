/*
 * The Agents tab (box 22, t-2b6d9b3541), with no DOM: each Work Desks desk as
 * its A2A Agent Card - what it does, its skills - with who sits at it, the
 * job and step it is on, and every permission ask or question waiting on the
 * user. AutomatU only shows this; the user answers from their chat.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* "remove_analysis" -> "remove analysis"; a step reads as words. */
export function stepName(step) {
  return String(step || '').replace(/_/g, ' ');
}

/* How long ago an ISO time was, said briefly: "just now", "3 min", "2 h", "4 d". */
export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

/* Who sits at a desk, as the card shows it: "Claude · claude-sonnet-5-5". */
export function sitter(live) {
  if (!live || !live.agent) return '';
  const who = { claude: 'Claude', agy: 'Gemini through agy' }[live.agent] || live.agent;
  return live.model ? `${who} · ${live.model}` : who;
}

/* The line a run shows on its card: the job, then the step it is on and who does it. */
export function runLine(r) {
  const s = r.step;
  const job = esc(r.job === 'chat' ? 'answering a message' : r.job);
  if (!s) return `<b>${job}</b> · starting`;
  const who = { code: 'the desk', agent: 'the agent', user: 'you' }[s.actor] || s.actor;
  const state = r.state === 'waiting' ? 'waiting on you' : s.status === 'running' ? 'now' : s.status;
  return `<b>${job}</b> · ${esc(stepName(s.step))} <span class="dk-who">(${esc(who)})</span> · <span class="dk-${r.state === 'waiting' ? 'wait' : 'run'}">${esc(state)}</span>`;
}

/* One desk's card. */
export function cardHtml(d, now = Date.now()) {
  const c = d.card, live = d.live;
  if (!c) {
    return `<article class="dk off"><header><h3>${esc(d.url)}</h3><span class="dk-state">${esc(d.note || 'not running')}</span></header></article>`;
  }
  const runs = live && live.runs.length
    ? live.runs.map((r) => `<li>${runLine(r)}<span class="dk-t">${esc(ago(r.started_at, now))}</span></li>`).join('')
    : `<li class="dk-idle">${live ? 'Idle: no job running' : esc(d.note || '')}</li>`;
  const asks = live && live.waiting.length
    ? `<section class="dk-asks"><h4>Waiting on you (${live.waiting.length})</h4><ul>` + live.waiting.map((a) =>
      `<li class="dk-ask"><span class="dk-kind">${esc(a.kind)}</span> ${esc(a.text)}` +
      `<span class="dk-t">${esc(a.job ? a.job + ' · ' : '')}${esc(ago(a.asked_at, now))}</span></li>`).join('') +
      '</ul><p class="dk-hint">Answer from your chat - AutomatU only shows what waits.</p></section>'
    : '';
  const skills = (c.skills || []).map((s) =>
    `<li><b>${esc(s.name)}</b> ${esc(s.description)}${s.examples && s.examples.length ? `<span class="dk-ex">“${esc(s.examples[0])}”</span>` : ''}</li>`).join('');
  return `<article class="dk${live && live.waiting.length ? ' asking' : ''}">` +
    `<header><h3>${esc(c.name)}</h3><span class="dk-state on">running</span></header>` +
    (sitter(live) ? `<div class="dk-sit">${esc(sitter(live))}</div>` : '') +
    `<p class="dk-desc">${esc(c.description)}</p>` +
    `<section><h4>Now</h4><ul class="dk-runs">${runs}</ul></section>` + asks +
    (skills ? `<section><h4>Skills</h4><ul class="dk-skills">${skills}</ul></section>` : '') +
    `<footer>${esc(d.url)} · A2A Agent Card${c.version ? ' v' + esc(c.version) : ''}</footer></article>`;
}

/* The whole tab. */
export function desksHtml(answer, now = Date.now()) {
  const ds = (answer && answer.desks) || [];
  if (!ds.length) return '<div class="status">No desks are listed. AutomatU looks for them at AUTOMATU_DESKS.</div>';
  const waiting = ds.reduce((n, d) => n + ((d.live && d.live.waiting.length) || 0), 0);
  return `<div class="dks"><div class="dks-head"><b>Agents</b> - each desk as its Agent Card, with what it is doing now` +
    (waiting ? ` · <span class="dk-wait">${waiting} waiting on you</span>` : '') + '</div>' +
    `<div class="dks-grid">${ds.map((d) => cardHtml(d, now)).join('')}</div></div>`;
}
