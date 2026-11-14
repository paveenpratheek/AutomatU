/*
 * Agents in AutomatU, one at each desk (box 30, t-e02af0ac56): the Agents button
 * on the hex of a desk's Main canvas, and the window it opens. With no agent at
 * the desk it offers the choice - Antigravity (agy) or Claude, the model, the
 * folder it works in; then it is the desk's chat, as CanvasX's agent chat is
 * (t-3400eea91e): the user's messages and other agents', each named by who sent
 * it, the agent's replies with their steps, each permission it asks for with
 * Allow and Refuse, and what waits in the queue, which can be taken back.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const AGENT_NAMES = { agy: 'Antigravity', claude: 'Claude' };

export function dayOf(at, now = new Date()) {
  const d = new Date(String(at || '').replace(' ', 'T'));
  if (isNaN(d)) return '';
  if (d.toDateString() === now.toDateString()) return 'today';
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

export function timeOf(at) {
  const d = new Date(String(at || ''));
  return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const when = (at, now) => { const d = dayOf(at, now); return (d === 'today' ? '' : d + ' ') + timeOf(at); };

/* The button: on the hex's top edge, near its left corner, with a green dot
   while an agent is at the desk - AutomatU's, or one sitting there from its app. */
export function agentsBoxHtml(cell, canvas, sitting = [], desk = '', placed = false) {
  const left = cell.l + cell.w * 0.25 + 4, top = cell.t + 5;
  const here = (sitting || []).filter((s) => !s.away);
  const on = placed || here.length > 0;
  const said = !desk ? 'Agents: this canvas is no desk\'s Main canvas yet'
    : placed ? `Agents: the agent at the ${desk} desk - open its chat`
      : here.length ? `Agents: ${here.map((s) => s.agent).join(', ')} ${here.length === 1 ? 'is' : 'are'} sitting at the ${desk} desk`
        : `Agents: choose an agent for the ${desk} desk`;
  return `<button type="button" class="agbox${on ? ' on' : ''}" data-talk="${esc(canvas)}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px" ` +
    `title="${esc(said)}" aria-label="${esc(said)}">` + (on ? `<i class="agdot" aria-hidden="true"></i>` : '') +
    `<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"></circle>` +
    `<path d="M3 13.5c.8-2.6 2.8-3.8 5-3.8s4.2 1.2 5 3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>` +
    `<span>Agents</span></button>`;
}

const STATE = { idle: 'ready', starting: 'starting…', working: 'working…', waiting: 'waiting on your answer' };
const SEND_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

/* The choice of an agent for the desk. A: the window's state; D: the view. */
function chooseHtml(A, D) {
  const agent = A.agent || 'agy';
  const ms = (D.models && D.models[agent]) || [];
  const model = ms.some((m) => m.id === A.model) ? A.model : (ms[0] ? ms[0].id : '');
  const folder = A.folder !== undefined ? A.folder : (D.folder || '');
  return `<form class="tk-choose" data-agentform="1">` +
    `<p class="mt">No agent is at the ${esc(D.desk.name)} desk yet. Choose one: AutomatU starts it and keeps it until you detach it or close AutomatU.</p>` +
    `<div class="tk-l">Agent</div><div class="tk-seg" role="radiogroup" aria-label="Agent">` +
    ['agy', 'claude'].map((a) => `<label class="${a === agent ? 'on' : ''}"><input type="radio" name="agent" value="${a}" data-agent-pick="${a}"${a === agent ? ' checked' : ''}>${AGENT_NAMES[a]}</label>`).join('') + `</div>` +
    `<label class="tk-l" for="tkmodel">Model</label><select id="tkmodel" name="model" data-agent-model="1">` +
    ms.map((m) => `<option value="${esc(m.id)}"${m.id === model ? ' selected' : ''}>${esc(m.name)}</option>`).join('') + `</select>` +
    `<label class="tk-l" for="tkfolder">Works in</label><input id="tkfolder" name="folder" type="text" value="${esc(folder)}" placeholder="the project's folder, e.g. E:\\Coding CLI\\Portfolio" spellcheck="false">` +
    (A.said ? `<p class="said">${esc(A.said)}</p>` : '') +
    `<button type="submit" class="kbtn"${A.busy ? ' disabled' : ''}>Place the agent</button></form>`;
}

/* One line of the chat. wide: the side panel shows the work in hand and the queue,
   so the chat leaves out the live steps and the Take back. */
function lineHtml(m, ag, now, wide = false) {
  const head = `<div class="tk-by"><b>${esc(m.by)}</b><span class="mt">${esc(when(m.at, now))}</span></div>`;
  if (m.kind === 'note') return `<div class="tk-m note${m.state === 'failed' ? ' bad' : ''}">${esc(m.text)}</div>`;
  if (m.kind === 'ask') {
    const wait = m.state === 'waiting';
    return `<div class="tk-m ask${wait ? ' live' : ''}">${head}<div>The agent asks to: <b>${esc(m.text)}</b></div>` +
      ((m.data && m.data.paths && m.data.paths.length) ? `<div class="mt">${m.data.paths.map(esc).join(', ')}</div>` : '') +
      (wait ? `<div class="kdrow"><button type="button" class="kbtn" data-agent-answer="${m.id}" data-allow="1">Allow</button>` +
        `<button type="button" class="kbtn quiet" data-agent-answer="${m.id}" data-allow="0">Refuse</button></div>`
        : `<div class="mt">${({ allowed: 'Allowed', refused: 'Refused' })[m.state] || 'Not answered'}</div>`) + `</div>`;
  }
  if (m.kind === 'reply') {
    const steps = (m.data && m.data.steps) || [];
    const refused = (m.data && m.data.refused) || [];
    return `<div class="tk-m reply" data-line="${m.id}">${head}<div class="tk-a">${esc(m.text)}</div>` +
      (steps.length ? `<details class="tk-d"><summary>${steps.length} step${steps.length === 1 ? '' : 's'}</summary><ul class="tk-steps">` +
        steps.map((s) => `<li class="${esc(s.status)}" title="${esc(s.title)}"><span>${esc(s.title)}</span></li>`).join('') + `</ul></details>` : '') +
      (refused.length ? `<div class="mt">Not allowed: ${refused.map(esc).join('; ')}</div>` : '') + `</div>`;
  }
  // a message to the agent: the user's, or another agent's
  const mine = m.who === 'user';
  const working = ag && ag.working_on === m.id;
  const chip = m.state === 'queued' ? `<span class="tk-chip">queued</span>` + (wide ? '' : `<button type="button" class="tk-link" data-agent-takeback="${m.id}">Take back</button>`)
    : working ? `<span class="tk-chip live">${esc(STATE[ag.state] || ag.state)}</span>`
      : ['stopped', 'failed', 'taken back', 'not run'].includes(m.state) ? `<span class="tk-chip">${esc(m.state)}</span>` : '';
  const live = working ? (!wide && (ag.steps || []).length ? `<ul class="tk-steps">` + ag.steps.map((s) => `<li class="${esc(s.status)}" title="${esc(s.title)}"><span>${esc(s.title)}</span></li>`).join('') + `</ul>` : '') +
    (ag.said ? `<div class="tk-a">${esc(ag.said)}</div>` : '') : '';
  return `<div class="tk-m ${mine ? 'me' : 'other'}">${mine ? '' : head}<div class="tk-q">${esc(m.text)}</div>` +
    (chip ? `<div class="tk-st">${chip}</div>` : '') + `</div>` + (live ? `<div class="tk-m reply live">${live}</div>` : '');
}

const stepsHtml = (steps) => `<ul class="tk-steps">` + steps.map((s) => `<li class="${esc(s.status)}" title="${esc(s.title)}"><span>${esc(s.title)}</span></li>`).join('') + `</ul>`;

/* The side panel of the landscape window: what the agent is doing now, what
   waits on the user, the queue, and the agent itself. */
function sideHtml(D, ag, now) {
  const msgs = D.messages || [];
  const on = msgs.find((m) => m.id === ag.working_on);
  const asks = msgs.filter((m) => m.kind === 'ask' && m.state === 'waiting').length;
  const queued = msgs.filter((m) => m.kind === 'message' && m.state === 'queued');
  const model = ((D.models && D.models[ag.agent]) || []).find((m) => m.id === ag.model);
  const n = (ag.steps || []).length;
  return `<div class="tk-sec"><div class="tk-l">Now</div>` +
    (on ? `<div class="tk-now"><span class="tk-chip live">${esc(STATE[ag.state] || ag.state)}</span><div class="tk-nowq" title="${esc(on.text)}">${esc(on.text)}</div>` +
      `<div class="mt">from ${esc(on.by)}</div></div>` + (n ? `<div class="mt">${n} step${n === 1 ? '' : 's'}</div>` + stepsHtml(ag.steps) : '')
      : `<div class="mt">Ready for work.</div>`) + `</div>` +
    (asks ? `<div class="tk-sec tk-wait"><b>${asks} ask${asks === 1 ? '' : 's'} waiting on you</b><span class="mt">Answer in the chat.</span></div>` : '') +
    `<div class="tk-sec"><div class="tk-l">Queue${queued.length ? ' · ' + queued.length : ''}</div>` +
    (queued.length ? queued.map((m) => `<div class="tk-qi"><span class="tt" title="${esc(m.text)}">${esc(m.text)}</span><span class="mt">${esc(m.by)} · ${esc(when(m.at, now))}</span>` +
      `<button type="button" class="tk-link" data-agent-takeback="${m.id}">Take back</button></div>`).join('') : `<div class="mt">Nothing waiting.</div>`) + `</div>` +
    `<div class="tk-sec"><div class="tk-l">Agent</div><div class="tk-kv"><span>${esc(AGENT_NAMES[ag.agent] || ag.agent)}</span><span class="mt">${esc(model ? model.name : ag.model)}</span></div>` +
    `<div class="tk-kv"><span class="mt">Works in</span><code title="${esc(ag.folder)}">${esc(ag.folder)}</code></div>` +
    (ag.chosen_at ? `<div class="tk-kv"><span class="mt">Placed</span><span>${esc(when(ag.chosen_at, now))}</span></div>` : '') +
    (ag.working_on ? `<button type="button" class="kbtn quiet" data-agent-stop="1">Stop what it is doing</button>` : '') + `</div>`;
}

/* A: { canvas, data: the view | null, agent, model, folder, draft, said, busy, wide } */
export function agentsHtml(A, now = new Date()) {
  if (!A) return '';
  const D = A.data;
  let title = 'Agents', sub = A.canvas, body, foot = '', dot = false, detach = '', side = '';
  const wide = !!A.wide;
  if (!D) body = `<p class="mt">Reading the desk…</p>`;
  else if (!D.desk) body = `<p class="mt">${esc(D.note || 'This canvas is no desk\'s Main canvas.')}</p>`;
  else if (!D.agent) {
    title = D.desk.name + ' desk'; sub = 'no agent yet';
    const earlier = (D.messages || []).length ? `<div class="tk-l">Earlier at this desk</div>` + D.messages.slice(wide ? -12 : -6).map((m) => lineHtml(m, null, now, wide)).join('') : '';
    body = chooseHtml(A, D) + (wide ? '' : earlier);
    if (wide) side = earlier || `<div class="mt">Nothing has been said at this desk yet.</div>`;
  } else {
    const ag = D.agent; dot = true;
    const model = ((D.models && D.models[ag.agent]) || []).find((m) => m.id === ag.model);
    title = `${AGENT_NAMES[ag.agent] || ag.agent} at the ${D.desk.name} desk`;
    sub = `${model ? model.name : ag.model} · ${STATE[ag.state] || ag.state}`;
    detach = `<button type="button" class="tk-link" data-agent-detach="1" title="Take the agent off the desk: it stops, with what it started">Detach</button>`;
    const lines = (D.messages || []).map((m) => lineHtml(m, ag, now, wide)).join('');
    body = lines || `<p class="mt">Give the agent work. It answers here; a permission it needs is asked here too.</p>`;
    const busy = ag.state !== 'idle';
    foot = `<form class="askbox tk-form" data-agentsend="1"><label class="vh" for="tktext">Message the agent</label>` +
      `<textarea id="tktext" name="text" rows="2" placeholder="${busy ? 'Queued until the agent is free…' : 'Give the agent work…'}">${esc(A.draft || '')}</textarea>` +
      `<div class="askrow"><span class="mt${wide ? ' tk-hint' : ''}">${wide ? (busy ? 'Sent while it works, it waits in the queue' : 'It starts as soon as you send') : esc(ag.folder)}</span>` +
      (ag.working_on && !wide ? `<button type="button" class="kbtn quiet" data-agent-stop="1">Stop</button>` : '') +
      `<button type="submit" class="asksend" aria-label="Send"${A.busy ? ' disabled' : ''}>${SEND_ICON}</button></div></form>` +
      (A.said ? `<p class="said">${esc(A.said)}</p>` : '');
    foot = `<div class="tk-foot col">${foot}</div>`;
    if (wide) side = sideHtml(D, ag, now);
  }
  const head = `<div class="tk-h"><span class="tk-who"><b>${dot ? '<i class="agdot" aria-hidden="true"></i>' : ''}${esc(title)}</b>` +
    `<span class="mt">${esc(sub)}</span></span><span class="tk-hb">${detach}<button type="button" class="tk-x" data-talk-close="1" aria-label="Close">×</button></span></div>`;
  if (wide && side) {
    return `<div class="tk wide" role="dialog" aria-modal="true" aria-label="${esc(title)}">${head}<div class="tk-cols"><div class="tk-main"><div class="tk-body">${body}</div>${foot}</div>` +
      `<aside class="tk-side" aria-label="The agent now">${side}</aside></div></div>`;
  }
  return `<div class="tk" role="dialog" aria-modal="true" aria-label="${esc(title)}">${head}<div class="tk-body">${body}</div>${foot}</div>`;
}
