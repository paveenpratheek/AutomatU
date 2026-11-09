/*
 * The plan in time on the Code map (t-25f10ce5fd), with no DOM: where a
 * moment sits along the timeline, which phase holds it, and times as the
 * user reads them - in IST, while the records keep UTC (t-1660f9a7e6).
 */
const ms = (t) => Date.parse(t);

/* A moment's place along the strip, 0..1, from the first phase's start to now. */
export function scaleOf(phases, now) {
  const a = ms(phases.length ? phases[0].start : now), b = Math.max(ms(now), a + 1);
  return (t) => Math.max(0, Math.min(1, (ms(t) - a) / (b - a)));
}

/* The phase a moment falls in, or -1. */
export function phaseAt(phases, t) {
  const x = ms(t);
  return phases.findIndex((p) => x >= ms(p.start) && (!p.end || x < ms(p.end)));
}

/* "8 Nov, 17:29 IST" */
export function ist(t, withDay = true) {
  if (!t) return 'now';
  const d = new Date(ms(t) + 330 * 60000);
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return (withDay ? d.getUTCDate() + ' ' + mon + ', ' : '') + hh + ':' + mm + ' IST';
}

/* Where the scrubber can rest (t-eef843abdf): every map, every plan version,
   and now - in time order. */
export function snapTargets(T) {
  const out = T.maps.map((m) => ({ at: m.at, kind: 'map', id: m.id }))
    .concat(T.phases.flatMap((p) => p.versions.map((v) => ({ at: v, kind: 'version' }))));
  out.push({ at: T.now, kind: 'now' });
  return out.sort((a, b) => ms(a.at) - ms(b.at));
}

/* The time at a place along the strip, 0..1 - the scale read backwards. */
export function timeAt(phases, now, f) {
  const a = ms(phases.length ? phases[0].start : now), b = Math.max(ms(now), a + 1);
  return new Date(a + Math.max(0, Math.min(1, f)) * (b - a)).toISOString();
}

/* The snap point nearest a place along the strip. */
export function nearestTarget(targets, at, f) {
  let best = null, d = Infinity;
  for (const t of targets) { const x = Math.abs(at(t.at) - f); if (x < d) { d = x; best = t; } }
  return best;
}

/* The map shown for a moment: the newest made at or before it. */
export function mapAtOrBefore(maps, t) {
  let best = null;
  for (const m of maps) if (ms(m.at) <= ms(t)) best = m;
  return best;
}

/* The newest map made inside a span, or null. */
export function lastMapIn(maps, start, end) {
  const inside = maps.filter((m) => ms(m.at) >= ms(start) && (!end || ms(m.at) < ms(end)));
  return inside.length ? inside[inside.length - 1] : null;
}

/* What changed between the map on screen and the next, by region id
   (t-c4b73fa51a): prev and next are Maps of id -> {x, y, col}. A region new
   pops in, one gone pops out where it was, one that moved slides from its old
   place, one that changed box fades from its old colour; the rest stay. */
export function hexChanges(prev, next) {
  const out = { enter: [], leave: [], move: [], recolour: [], stay: [] };
  for (const [id, n] of next) {
    const p = prev.get(id);
    if (!p) out.enter.push(id);
    else if (Math.abs(p.x - n.x) > 0.5 || Math.abs(p.y - n.y) > 0.5) out.move.push(id);
    else if (p.col !== n.col) out.recolour.push(id);
    else out.stay.push(id);
  }
  for (const id of prev.keys()) if (!next.has(id)) out.leave.push(id);
  return out;
}

/* A small fixed delay per region, so new code pops in as a ripple rather than
   all at once - the same region always waits the same. */
export function popDelay(id, spread) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 * spread;
}
