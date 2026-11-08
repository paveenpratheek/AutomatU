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
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Numbers:
    min_score: float
    min_margin: float
    overlap: float = 0.0
    max_shared: int = 3


@dataclass
class Placement:
    region: str
    best: str
    score: float
    margin: float
    near: list[str]       # the group it would join, placed or not (t-21f43bf927)
    sections: list[str]   # empty while not yet placed

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


def place_regions(region_vecs: dict[str, np.ndarray], section_vecs: dict[str, np.ndarray], n: Numbers | None) -> list[Placement]:
    if n is None or n.min_score is None or n.min_margin is None or n.min_margin < 0:
        raise ValueError("placing needs min_score and min_margin (from calibration)")
    return [Placement(region=r, **decide(ranked, n)) for r, ranked in rank_sections(region_vecs, section_vecs)]
