/*
 * Talking to the agent from its hex (box 30, t-275ce407f2): the small agents
 * box at the top left of a canvas's hex, and the window it opens - a field for
 * one task, the agent's last five conversations on the project to continue
 * from, newest picked (t-daa2fe5bf1), and the task as it runs: the agent's
 * reply, its tool steps, and any permission it asks for, answered by the user.
 * The agent continues a copy, so the conversation in the app is not changed.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const APP = { claude: ['C', 'Claude'], antigravity: ['A', 'Antigravity'] };

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

/* The box itself: placed on the hex's top edge, near its left corner, with a
   green dot while an agent sits at the desk whose Main canvas this is. */
export function agentsBoxHtml(cell, canvas, sitting = [], desk = '') {
  // just inside the top edge, beside its left corner: clear of a title on two lines
  const left = cell.l + cell.w * 0.25 + 4, top = cell.t + 5;
  const here = (sitting || []).filter((s) => !s.away);
  const said = here.length ? `${here.map((s) => s.agent).join(', ')} ${here.length === 1 ? 'is' : 'are'} sitting at the ${desk} desk - give a task`
    : 'Give the agent a task';
  return `<button type="button" class="agbox${here.length ? ' on' : ''}" data-talk="${esc(canvas)}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px" ` +
    `title="${esc(said)}" aria-label="${esc(said)}">` + (here.length ? `<i class="agdot" aria-hidden="true"></i>` : '') +
    `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"></circle>` +
    `<path d="M3 13.5c.8-2.6 2.8-3.8 5-3.8s4.2 1.2 5 3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg></button>`;
}

const live = (r) => r && ['starting', 'working', 'asking'].includes(r.state);

/* A running task, as [what scrolls, the footer that stays]: each tool step on
   one line - a long command in full on hover - in a short list of its own. */
function runHtml(r, convTitle) {
  const n = (r.steps || []).length;
  const steps = (r.steps || []).map((s) => `<li class="${esc(s.status)}" title="${esc(s.title)}"><span>${esc(s.title)}</span></li>`).join('');
  const ask = r.ask ? `<div class="tk-ask"><span>The agent asks to: <b>${esc(r.ask.title)}</b></span><div class="kdrow">` +
    r.ask.options.map((o) => `<button type="button" class="kbtn${/reject/.test(o.kind) ? ' quiet' : ''}" data-talk-answer="${esc(o.id)}">${esc(o.name)}</button>`).join('') +
    (r.ask.options.some((o) => /reject/.test(o.kind)) ? '' : `<button type="button" class="kbtn quiet" data-talk-answer="">No</button>`) + `</div></div>` : '';
  const said = { starting: 'Opening a copy of the conversation…', working: 'Working…', asking: 'Waiting on your answer',
    done: 'Done', stopped: 'Stopped', failed: 'Could not finish' }[r.state] || r.state;
  const body = `<div class="tk-q">${esc(r.text)}</div>` +
    (steps ? `<div class="tk-l">${n} step${n === 1 ? '' : 's'}</div><ul class="tk-steps">${steps}</ul>` : '') +
    (r.reply ? `<div class="tk-a">${esc(r.reply)}</div>` : '') + ask +
    (r.error ? `<p class="said">${esc(r.error)}</p>` : '');
  const foot = `<div class="tk-foot"><span class="mt">${esc(said)}${convTitle ? ` · in a copy of “${esc(convTitle)}”` : ''}</span>` +
    (live(r) ? `<button type="button" class="kbtn quiet" data-talk-stop="1">Stop</button>` : `<button type="button" class="kbtn" data-talk-new="1">New task</button>`) + `</div>`;
  return [body, foot];
}

/* T: { canvas, data: {agents, conversations, note, run} | null, pick, draft, run, dismissed, said } */
export function talkHtml(T, now = new Date()) {
  if (!T) return '';
  const D = T.data, convs = (D && D.conversations) || [];
  const who = D && D.agents && D.agents.length ? D.agents.join(', ') : 'The agent';
  const here = ((D && D.sitting) || []).filter((s) => !s.away);
  const where = D && D.desk ? (here.length ? `sitting at the ${D.desk} desk${here[0].since ? ' since ' + timeOf(here[0].since) : ''}`
    : `nobody is sitting at the ${D.desk} desk`) : T.canvas;
  let body, foot = '';
  const run = T.run && T.run.id !== T.dismissed ? T.run : null;
  if (!D) body = `<p class="mt">Reading the agent's conversations…</p>`;
  else if (run) [body, foot] = runHtml(run, (convs.find((c) => c.id === run.conversation) || {}).title);
  else if (D.note && !convs.length) body = `<p class="mt">${esc(D.note)}</p>`;
  else {
    const pick = T.pick || (convs[0] ? convs[0].platform + ':' + convs[0].id : '');
    body = `<form class="askbox tk-form" data-talkform="1"><label class="vh" for="tktext">Write a task</label>` +
      `<textarea id="tktext" name="text" rows="3" placeholder="Write a task…">${esc(T.draft || '')}</textarea>` +
      `<div class="askrow"><span class="mt">One task, one answer</span><button type="submit" class="asksend" aria-label="Give the task"${convs.length && !T.busy ? '' : ' disabled'}>` +
      `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg></button></div></form>` +
      (T.said ? `<p class="said">${esc(T.said)}</p>` : '') +
      `<div class="tk-l">Continue from</div>` +
      (convs.length ? `<div class="tk-cs" role="radiogroup" aria-label="Continue from">` + convs.map((c) => {
        const key = c.platform + ':' + c.id, app = APP[c.platform] || ['?', c.platform];
        return `<label class="tk-c${key === pick ? ' on' : ''}"><input type="radio" name="tkconv" value="${esc(key)}" data-talk-pick="${esc(key)}"${key === pick ? ' checked' : ''}>` +
          `<span class="tk-app ${esc(c.platform)}" title="${esc(app[1])}">${app[0]}</span><span class="tt">${esc(c.title)}</span><span class="mt">${esc(dayOf(c.at, now))}</span></label>`;
      }).join('') + `</div>` : `<p class="mt">The agent has no conversation on this project yet in the Claude app or Antigravity.</p>`) +
      `<p class="mt tk-note">The agent continues a copy, so the conversation in the app is not changed.</p>`;
  }
  return `<div class="tk" role="dialog" aria-label="${esc(who)}"><div class="tk-h"><span class="tk-who"><b>${here.length ? '<i class="agdot" aria-hidden="true"></i>' : ''}${esc(who)}</b><span class="mt">${esc(where)}</span></span>` +
    `<button type="button" class="tk-x" data-talk-close="1" aria-label="Close">×</button></div><div class="tk-body">${body}</div>${foot}</div>`;
}
