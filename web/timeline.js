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

/* The newest map made inside a span, or null. */
export function lastMapIn(maps, start, end) {
  const inside = maps.filter((m) => ms(m.at) >= ms(start) && (!end || ms(m.at) < ms(end)));
  return inside.length ? inside[inside.length - 1] : null;
}
