/*
 * The traffic search, as agreed on 8 Nov (the prototype's v37 rules), with no
 * DOM so it can be tested in Node.
 *
 * Keywords are split by ";". A keyword of several words must appear with its
 * words side by side - with a space, a hyphen or run together. A one-word
 * keyword is widened by its word group and matches word starts when it has
 * four letters or more ("canvas" finds CanvasX). Given two to five keywords,
 * each pair is also searched side by side, both ways round, as automatic
 * keywords - shown in the filter only when they find something somewhere.
 * Each keyword has its own colour; a hexagon takes the colour of the most
 * specific keyword in it (more words), then the busiest.
 */
export const GROUPS = [
  ['stale', 'staleness', 'outdated', 'freshness', 'superseded'], ['lock', 'locks'],
  ['handshake', 'borders', 'approval', 'clash', 'clashes'], ['rag', 'ragx', 'retrieval'],
  ['haiku', 'claude', 'sonnet'], ['langgraph', 'langchain'],
];
export const COLS = ['#E39B0B', '#D6336C', '#0F9D8A', '#2F6FE0', '#8B4FD1', '#9A6A00', '#E8590C', '#4C6EF5', '#2B8A3E', '#C2255C', '#1098AD', '#5F3DC4'];

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/* The query as keywords: { key, alts, auto, words, col }. */
export function keywords(query) {
  const raw = String(query || '').trim().toLowerCase();
  const kw = [], seen = {};
  const add = (parts, auto) => {
    const key = parts.join(' ');
    if (!key || seen[key]) return;
    seen[key] = 1;
    let alts;
    if (parts.length > 1) alts = [key, parts.join('')];
    else {
      alts = GROUPS.find((g) => g.includes(key)) || [key];
      /* A long word already matches as a prefix, so its longer forms would count twice. */
      alts = alts.filter((t) => !alts.some((u) => u !== t && u.length >= 4 && t.startsWith(u)));
    }
    kw.push({ key, alts, auto: !!auto, words: parts.length, col: COLS[kw.length % COLS.length] });
  };
  const given = raw.split(';').map((s) => norm(s).split(' ').filter(Boolean)).filter((p) => p.length);
  given.forEach((p) => add(p, false));
  if (given.length > 1 && given.length <= 5) {
    given.forEach((a, i) => given.forEach((b, j) => {
      if (i === j) return;
      const A = ' ' + a.join(' ') + ' ', B = ' ' + b.join(' ') + ' ';
      if (A.includes(B) || B.includes(A)) return;
      add(a.concat(b), true);
    }));
  }
  return kw;
}

/* Hits of every keyword in one text: whole words, or word starts for words of
   four letters or more. One number per keyword, in keyword order. */
export function hitsOf(kw, text) {
  const hay = ' ' + norm(text) + ' ';
  return kw.map((k) => {
    let n = 0;
    for (const t of k.alts) {
      const needle = ' ' + t, prefix = t.length >= 4;
      let i = hay.indexOf(needle);
      while (i >= 0) { if (prefix || hay.charAt(i + needle.length) === ' ') n++; i = hay.indexOf(needle, i + needle.length); }
    }
    return n;
  });
}

export const add = (a, b, w = 1) => a.map((v, i) => v + w * (b[i] || 0));
export const zeros = (kw) => kw.map(() => 0);

/* Which keywords the filter shows - an automatic one only when it finds
   something somewhere (global[i] > 0) - and which are switched on. */
export function shownAndOn(kw, global, off = {}) {
  return kw.map((k, i) => { const shown = !k.auto || (global[i] || 0) > 0; return { shown, on: shown && !off[k.key] }; });
}

/* The keyword a hexagon is coloured by: the most specific one present (more
   words), then the one with most hits; -1 when none is on. */
export function dominant(kw, on, arr) {
  let b = -1, best = 0;
  arr.forEach((v, i) => { const sc = kw[i].words * 1e6 + v; if (on[i].on && v > 0 && sc > best) { best = sc; b = i; } });
  return b;
}

/* A hexagon's traffic: the hits of the keywords switched on. */
export const traffic = (on, arr) => arr.reduce((s, v, i) => s + (on[i].on ? v : 0), 0);

/* A code region's traffic per keyword: its own code (name and file) and the
   plan box it sits under weigh three times; its commits and decisions count
   once each, at most four times a region. */
export function regionHits(kw, { code, box, commits, thoughts }) {
  const c = hitsOf(kw, code), b = hitsOf(kw, box);
  const cm = zeros(kw), th = zeros(kw);
  for (const t of commits) hitsOf(kw, t).forEach((v, i) => { if (v) cm[i]++; });
  for (const t of thoughts) hitsOf(kw, t).forEach((v, i) => { if (v) th[i]++; });
  return kw.map((_, i) => 3 * c[i] + 3 * Math.min(4, b[i]) + Math.min(4, cm[i]) + Math.min(4, th[i]));
}
