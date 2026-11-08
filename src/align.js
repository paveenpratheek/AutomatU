/*
 * Placing regions under sections. Code is truth: a region goes under the
 * section it matches best only when that match is strong enough (minScore)
 * and clearly ahead of the next section (minMargin). Anything else stays not
 * yet placed - the canvas has not caught up with it - and the section never
 * pulls code to itself (t-1610973770). Every box of the canvas is a
 * candidate (t-a73a9d22e0).
 *
 * A region can do several topics - most often when one commit did several
 * things - and then it sits in every section it matches about equally well,
 * like the overlap of a Venn diagram: all sections within `overlap` of its
 * best, up to maxShared of them, provided that group together leads the
 * rest by minMargin (t-aa80ed9977).
 *
 * The numbers are set by calibration on canvases whose links are known,
 * never by looking at the project being placed (t-d47e303b39).
 */
import { cosine } from './embed.js';

/* Every region's sections, best first, with their scores. */
export function rankSections(regionVecs, sectionVecs) {
  const sections = [...sectionVecs.entries()];
  const out = [];
  for (const [region, v] of regionVecs) {
    const ranked = sections.map(([address, s]) => ({ address, score: cosine(v, s) })).sort((a, b) => b.score - a.score);
    if (ranked.length) out.push({ region, ranked });
  }
  return out;
}

/* One region's placement from its ranked sections. */
export function decide(ranked, { minScore, minMargin, overlap = 0, maxShared = 3 }) {
  const top = ranked[0].score;
  let n = 1;
  while (n < Math.min(maxShared, ranked.length) && top - ranked[n].score <= overlap) n++;
  const group = ranked.slice(0, n);
  const next = ranked[n] ? ranked[n].score : -Infinity;
  const margin = Number.isFinite(next) ? group[n - 1].score - next : group[n - 1].score;
  const placed = top >= minScore && margin >= minMargin;
  return {
    best: ranked[0].address, score: top, margin,
    near: group.map((g) => g.address),
    sections: placed ? group.map((g) => g.address) : [],
    section: placed ? ranked[0].address : null,
  };
}

export function placeRegions(regionVecs, sectionVecs, numbers) {
  const { minScore, minMargin } = numbers || {};
  if (!(minScore >= -1) || !(minMargin >= 0)) throw new Error('placing needs minScore and minMargin (from calibration)');
  return rankSections(regionVecs, sectionVecs).map(({ region, ranked }) => ({ region, ...decide(ranked, numbers) }));
}
