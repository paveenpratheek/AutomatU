"""Placing regions under sections. Code is truth: a region goes under the section
it matches best only when that match is strong enough (min_score) and clearly
ahead of the next section (min_margin). Anything else stays not yet placed - the
canvas has not caught up with it - and the section never pulls code to itself
(t-1610973770).

A region can do several topics - most often when one commit did several things -
and then it sits in every section it matches about equally well, like the
overlap of a Venn diagram: all sections within `overlap` of its best, up to
max_shared of them, provided that group together leads the rest by min_margin
(t-aa80ed9977).

The numbers are set by calibration on canvases whose links are known, never by
looking at the project being placed (t-d47e303b39).

A close call - a region strong enough for the score bar whose best box is not
clearly ahead of the next - is settled by its neighbours' vote: the regions in
its file, the code it uses and the code that uses it. Among its top boxes it goes
where enough of its placed neighbours sit, and waits when they disagree. Only
neighbours placed on their own merits vote, so a vote never builds on another;
other code is the evidence, never the box (t-4c304baf12).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Vote:
    """How a close call is settled by its neighbours (t-4c304baf12), calibrated
    on RAGX and checked on NoteX (t-8ba9961859)."""
    top: int = 2           # the region's top boxes the vote may choose among
    min_votes: int = 2     # placed neighbours that must sit in the chosen box
    share: float = 0.6     # and their share of all its placed neighbours


@dataclass
class Numbers:
    min_score: float
    min_margin: float
    overlap: float = 0.0
    max_shared: int = 3
    vote: Vote | None = None


@dataclass
class Placement:
    region: str
    best: str
    score: float
    margin: float
    near: list[str]       # the group it would join, placed or not (t-21f43bf927)
    sections: list[str]   # empty while not yet placed
    voted: bool = False   # placed by its neighbours' vote, not on its own

    @property
    def section(self) -> str | None:
        return self.sections[0] if self.sections else None


def rank_sections(region_vecs: dict[str, np.ndarray], section_vecs: dict[str, np.ndarray]) -> list[tuple[str, list[tuple[str, float]]]]:
    """Every region's sections, best first, with their cosine scores - one
    matrix product for all of them (t-a53c604a4c)."""
    if not region_vecs or not section_vecs:
        return []
    names = list(section_vecs)
    S = np.stack([section_vecs[n] for n in names])
    S = S / np.linalg.norm(S, axis=1, keepdims=True)
    regions = list(region_vecs)
    R = np.stack([region_vecs[r] for r in regions])
    R = R / np.linalg.norm(R, axis=1, keepdims=True)
    scores = R @ S.T
    out = []
    for i, r in enumerate(regions):
        order = np.argsort(-scores[i], kind="stable")
        out.append((r, [(names[j], float(scores[i, j])) for j in order]))
    return out


def decide(ranked: list[tuple[str, float]], n: Numbers) -> dict:
    top = ranked[0][1]
    k = 1
    while k < min(n.max_shared, len(ranked)) and top - ranked[k][1] <= n.overlap:
        k += 1
    group = ranked[:k]
    nxt = ranked[k][1] if k < len(ranked) else None
    margin = group[-1][1] - nxt if nxt is not None else group[-1][1]
    placed = top >= n.min_score and margin >= n.min_margin
    return {"best": ranked[0][0], "score": top, "margin": margin,
            "near": [g[0] for g in group], "sections": [g[0] for g in group] if placed else []}


def neighbours_of(regions, uses: list[tuple[str, str]]) -> dict[str, set[str]]:
    """Each region's neighbours: the other regions of its file, and the regions
    its code uses or that use it."""
    by_file: dict[str, list[str]] = {}
    for r in regions:
        by_file.setdefault(r.file, []).append(r.id)
    out: dict[str, set[str]] = {r.id: set() for r in regions}
    for ids in by_file.values():
        for i in ids:
            out[i].update(x for x in ids if x != i)
    for a, b in uses:
        if a in out and b in out and a != b:
            out[a].add(b)
            out[b].add(a)
    return out


def vote(decided: list[tuple[str, dict, list[tuple[str, float]]]], neighbours: dict[str, set[str]], n: Numbers) -> int:
    """Settle close calls in place by the neighbours' vote; how many were placed.
    decided: (region, its decision, its ranked boxes)."""
    v = n.vote
    if not v:
        return 0
    placed = {r: set(d["sections"]) for r, d, _ in decided if d["sections"]}
    count = 0
    for r, d, ranked in decided:
        if d["sections"] or d["score"] < n.min_score:
            continue
        voters = [placed[x] for x in neighbours.get(r, ()) if x in placed]
        if len(voters) < v.min_votes:
            continue
        tally = sorted(((sum(box in s for s in voters), box) for box, _ in ranked[:v.top]), reverse=True)
        top, box = tally[0]
        if top >= v.min_votes and top / len(voters) >= v.share and (len(tally) < 2 or tally[1][0] < top):
            d["sections"], d["voted"] = [box], True
            count += 1
    return count


def place_regions(region_vecs: dict[str, np.ndarray], section_vecs: dict[str, np.ndarray], n: Numbers | None,
                  neighbours: dict[str, set[str]] | None = None) -> list[Placement]:
    if n is None or n.min_score is None or n.min_margin is None or n.min_margin < 0:
        raise ValueError("placing needs min_score and min_margin (from calibration)")
    decided = [(r, decide(ranked, n), ranked) for r, ranked in rank_sections(region_vecs, section_vecs)]
    if neighbours is not None:
        vote(decided, neighbours, n)
    return [Placement(region=r, **d) for r, d, _ in decided]
