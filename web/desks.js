/*
 * The Agents tab (box 22, t-2b6d9b3541), with no DOM: each Work Desks desk as
 * its A2A Agent Card - what it does, its skills - with who sits at it, the
 * job and step it is on, and every permission ask or question waiting on the
 * user. AutomatU only shows this; the user answers from their chat. The one
 * thing the user can do here is interrupt a running job (box 23,
 * t-5bb672b723): AutomatU passes the click on to the desk and decides nothing.
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

/* The Interrupt button a running job shows; waiting or finished jobs have none. */
export function interruptButton(r, url) {
  if (r.state !== 'running' || !url || !r.task_id) return '';
  return `<button class="dk-int" data-int-desk="${esc(url)}" data-int-task="${esc(r.task_id)}" data-int-job="${esc(r.job)}" ` +
    `title="Stop this job now: the desk asks you in your chat whether to carry on, cancel, or do something else">Interrupt</button>`;
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
    ? live.runs.map((r) => `<li class="dk-open" data-run-desk="${esc(d.url)}" data-run-task="${esc(r.task_id)}" title="Open the run, step by step">` +
      `${runLine(r)}<span class="dk-t">${esc(ago(r.started_at, now))}</span>${interruptButton(r, d.url)}</li>`).join('')
    : `<li class="dk-idle">${live ? 'Idle: no job running' : esc(d.note || '')}</li>`;
  const asks = live && live.waiting.length
    ? `<section class="dk-asks"><h4>Waiting on you (${live.waiting.length})</h4><ul>` + live.waiting.map((a) =>
      `<li class="dk-ask"><span class="dk-kind">${esc(a.kind)}</span> ${esc(a.text)}` +
      `<span class="dk-t">${esc(a.job ? a.job + ' · ' : '')}${esc(ago(a.asked_at, now))}</span></li>`).join('') +
      '</ul><p class="dk-hint">Answer from your chat - AutomatU only shows what waits.</p></section>'
    : '';
  const going = new Set(((live && live.runs) || []).map((r) => r.task_id));
  const past = (d.recent || []).filter((r) => !going.has(r.task_id)).slice(0, 5);
  const lately = past.length ? '<section><h4>Lately</h4><ul class="dk-runs">' + past.map((r) =>
    `<li class="dk-open" data-run-desk="${esc(d.url)}" data-run-task="${esc(r.task_id)}" title="Open the run, step by step">` +
    `<b>${esc(r.job === 'chat' ? 'answering a message' : r.job)}</b> · <span class="dk-${r.state === 'failed' ? 'bad' : 'done'}">${esc(r.state)}</span>` +
    `<span class="dk-t">${esc(ago(r.ended_at || r.started_at, now))}</span></li>`).join('') + '</ul></section>' : '';
  const skills = (c.skills || []).map((s) =>
    `<li><b>${esc(s.name)}</b> ${esc(s.description)}${s.examples && s.examples.length ? `<span class="dk-ex">“${esc(s.examples[0])}”</span>` : ''}</li>`).join('');
  return `<article class="dk${live && live.waiting.length ? ' asking' : ''}">` +
    `<header><h3>${esc(c.name)}</h3><span class="dk-state on">running</span></header>` +
    (sitter(live) ? `<div class="dk-sit">${esc(sitter(live))}</div>` : '') +
    `<p class="dk-desc">${esc(c.description)}</p>` +
    `<section><h4>Now</h4><ul class="dk-runs">${runs}</ul></section>` + asks + lately +
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
    (answer.said ? `<div class="dk-said">${esc(answer.said)}</div>` : '') +
    `<div class="dks-grid">${ds.map((d) => cardHtml(d, now)).join('')}</div></div>`;
}

/* ------------------------------------------------------------ a run, step by step (box 21, t-2ddbfdabb6) */

/* How long between two ISO times, said briefly: "4 s", "2 min", "1 h 5 min". */
export function took(a, b) {
  const s = Math.round((Date.parse(b) - Date.parse(a)) / 1000);
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

const WHO = { code: 'the desk', agent: 'the agent', user: 'you' };
const STATUS = { running: 'now', done: 'done', problems: 'went back', waiting: 'waiting on you', failed: 'failed',
  interrupted: 'interrupted' };

/* What a step cited, recorded, made or asked, as short parts. */
export function stepFacts(st) {
  const d = st.detail || {}, out = [];
  if (st.tries) out.push(`try ${st.tries}`);
  if (d.problems) out.push(`${d.problems} problem${d.problems === 1 ? '' : 's'} sent back`);
  if (d.cited && d.cited.length) out.push(`<span title="${esc(d.cited.join('\n'))}">${d.cited.length} hex${d.cited.length === 1 ? '' : 'es'} cited</span>`);
  if (d.map) out.push(`as of map ${esc(d.map)}`);
  if (d.recorded) out.push(`recorded at ${esc(d.recorded)}`);
  if (d.files && d.files.length) out.push(`made ${d.files.map(esc).join(', ')}`);
  if (d.question || d.asks) out.push(`asked: “${esc(d.question || d.asks)}”`);
  if (d.failed) out.push(`<span class="dk-bad">${esc(d.failed)}</span>`);
  if (d.error) out.push(`<span class="dk-bad">${esc(d.error)}</span>`);
  return out;
}

/* The run's own path: each step it took, in order - the one running now lit,
   the done ones with their time, a waiting one with what it asks. */
export function pathHtml(steps, now = Date.now()) {
  if (!steps.length) return '<p class="dk-idle">No step has started yet.</p>';
  return '<ol class="dk-path">' + steps.map((st) => {
    const t = st.status === 'running' ? `${took(st.started_at, new Date(now).toISOString())} so far` : took(st.started_at, st.ended_at);
    return `<li class="dk-st dk-st-${esc(st.status)}"><b>${esc(stepName(st.step))}</b>` +
      `<span>${esc(WHO[st.actor] || st.actor)} · ${esc(STATUS[st.status] || st.status)}${t ? ' · ' + esc(t) : ''}</span>` +
      (st.status === 'waiting' && st.detail && st.detail.question ? `<em>${esc(st.detail.question)}</em>` : '') + '</li>';
  }).join('') + '</ol>';
}

/* One run: its path, then each step in full, then everything it asked. */
export function runViewHtml(d, r, now = Date.now()) {
  const name = (d && d.card && d.card.name) || (d && d.url) || 'the desk';
  const back = '<button class="dk-back" data-run-back="1">← All agents</button>';
  if (!r) return `<div class="dks">${back}<div class="status">Reading the run…</div></div>`;
  const rows = r.steps.map((st) => `<tr class="dk-st-${esc(st.status)}"><td>${esc(stepName(st.step))}</td>` +
    `<td>${esc(WHO[st.actor] || st.actor)}</td><td>${esc(STATUS[st.status] || st.status)}</td>` +
    `<td>${esc(took(st.started_at, st.ended_at))}</td><td>${stepFacts(st).join(' · ')}</td></tr>`).join('');
  const asks = r.asks.length ? '<h4>What it asked</h4><ul class="dk-asked">' + r.asks.map((a) =>
    `<li><span class="dk-kind">${esc(a.kind)}</span> ${esc(a.text)}<span class="dk-t">${esc(ago(a.asked_at, now))}</span>` +
    (a.answered_at ? `<div class="dk-ans">You answered: ${esc(a.answer)}</div>` : '<div class="dk-ans dk-wait">waiting on you</div>') + '</li>').join('') + '</ul>' : '';
  const ended = r.ended_at ? ` · took ${esc(took(r.started_at, r.ended_at))}` : '';
  return `<div class="dks">${back}<div class="dks-head"><b>${esc(name)}</b> - ${esc(r.job === 'chat' ? 'answering a message' : r.job)} · ` +
    `<span class="dk-${r.state === 'waiting' ? 'wait' : r.state === 'running' ? 'run' : r.state === 'failed' ? 'bad' : 'done'}">${esc(r.state)}</span>` +
    ` · started ${esc(ago(r.started_at, now))} ago${ended}</div>` +
    pathHtml(r.steps, now) +
    (r.said ? `<p class="dk-said-run">${esc(r.said)}</p>` : '') +
    `<table class="dk-steps"><thead><tr><th>Step</th><th>Who</th><th>How</th><th>Took</th><th>What it did</th></tr></thead><tbody>${rows}</tbody></table>` +
    asks + `<footer class="dk-foot">task ${esc(r.task_id)} · ${esc(r.desk)}</footer></div>`;
}

/* ------------------------------------------------------------ the bell (box 21) */

const RANG = { waiting: 'is waiting on you', failed: 'failed', completed: 'finished', cancelled: 'was cancelled' };

/* A desk's runs that ring the bell: waiting on the user, failed or finished.
   Each is keyed by its task, state and what it said, so a second question on
   the same task rings again. */
export function deskEvents(answer) {
  const out = [];
  for (const d of (answer && answer.desks) || []) {
    for (const r of d.recent || []) {
      if (!RANG[r.state]) continue;
      out.push({ key: `${r.task_id}|${r.state}|${r.said}`, desk: (d.card && d.card.name) || d.url, url: d.url,
        task: r.task_id, job: r.job, state: r.state, said: r.said, at: r.ended_at || r.started_at });
    }
  }
  return out;
}

export function eventsHtml(events, seen, now = Date.now()) {
  if (!events.length) return '';
  return '<h3>Agents\' jobs</h3>' + events.map((e) =>
    `<button type="button" class="row dk-ev${seen.has(e.key) ? '' : ' new'}" data-run-desk="${esc(e.url)}" data-run-task="${esc(e.task)}" title="Open the run, step by step">` +
    `<span class="nm"><b>${esc(e.desk)}</b>: ${esc(e.job === 'chat' ? 'a message' : e.job)} ${esc(RANG[e.state])}</span>` +
    `<span class="mt">${esc(ago(e.at, now))}${e.said ? ' · ' + esc(e.said.slice(0, 120)) : ''}</span></button>`).join('');
}
