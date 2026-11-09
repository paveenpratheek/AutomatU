/*
 * The bell and the Agents button (box 13), with no DOM: what a notice says
 * about the box the code has moved past (t-026702a111), and who answers for
 * which repository (t-268908a2b1).
 */

/* The commits still on a notice: a ticked one is built and written down. */
export function liveCommits(n) {
  return (n.commits || []).filter((c) => c.state !== 'ticked');
}

/* The regions those commits changed, each once, with how many of them changed it -
   most changed first, then by file and line. */
export function regionsOf(n) {
  const by = new Map();
  for (const c of liveCommits(n)) {
    for (const r of c.regions || []) {
      const x = by.get(r.id) || { ...r, commits: 0 };
      x.commits += 1;
      by.set(r.id, x);
    }
  }
  return [...by.values()].sort((a, b) => b.commits - a.commits || a.file.localeCompare(b.file) || a.start - b.start);
}

/* "automatu/timeline.py · drift() · lines 198-250" */
export function regionLabel(r) {
  const name = r.name && !r.name.startsWith('(') ? r.name + '()' : (r.name || 'the top of the file');
  return `${r.file} · ${name} · lines ${r.start}–${r.end}`;
}

/* "2 commits since 9 Nov, 16:10 IST" - from the first commit still on it. */
export function sinceLine(n, ist) {
  const cs = liveCommits(n);
  if (!cs.length) return 'nothing left on it';
  const first = cs.map((c) => c.at).sort()[0];
  return `${cs.length} commit${cs.length === 1 ? '' : 's'} since ${ist(first)}`;
}

/* How a closed notice was closed, in words. */
export function closedLine(n) {
  const how = { done: 'the box was reworded', 'still-right': 'its words still hold', ignored: 'ignored, as the user asked', ticked: 'built and ticked' }[n.closed_how] || n.closed_how;
  return `${how}${n.closed_note ? ': ' + n.closed_note : ''} · ${n.closed_by || ''}`;
}
