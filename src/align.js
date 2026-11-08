/*
 * Placing regions under sections. Code is truth: a region goes under the
 * section it matches best only when that match is strong enough (minScore)
 * and clearly ahead of the next section (minMargin). Anything else stays not
 * yet placed - the canvas has not caught up with it - and the section never
 * pulls code to itself (t-1610973770). Every box of the canvas is a
 * candidate (t-a73a9d22e0).
 *
 * The two numbers are set by calibration on canvases whose links are known,
 * never by looking at the project being placed (t-d47e303b39).
 */
import { cosine } from './embed.js';

export function placeRegions(regionVecs, sectionVecs, { minScore, minMargin }) {
  if (!(minScore >= -1) || !(minMargin >= 0)) throw new Error('placing needs minScore and minMargin (from calibration)');
  const sections = [...sectionVecs.entries()];
  const out = [];
  for (const [region, v] of regionVecs) {
    let best = null, bestScore = -Infinity, secondScore = -Infinity;
    for (const [address, s] of sections) {
      const c = cosine(v, s);
      if (c > bestScore) { secondScore = bestScore; bestScore = c; best = address; }
      else if (c > secondScore) secondScore = c;
    }
    if (!best) continue;
    const margin = Number.isFinite(secondScore) ? bestScore - secondScore : bestScore;
    const placed = bestScore >= minScore && margin >= minMargin;
    out.push({ region, best, score: bestScore, margin, section: placed ? best : null });
  }
  return out;
}
