"""Calibration: sets the placement numbers on a canvas whose links are already
known, never on the project being placed.

The Harness canvas explains three repositories and its boxes cite their commits
and thoughts. Those cites are taken out of the words alignment reads
(t-71b7c1ee34), so here they serve as the answer: a region is known to belong to
every box that cites one of its live commits or linked thoughts. A region no box
cites is not counted either way (t-85a7189ecf).

Every set of numbers on a grid is scored as right - 2 x wrong over the known
regions: a region under a wrong box costs more than one left waiting
(t-a343e5943f). The best set is written to calibration.json, with the
self-test's pass mark, fixed before the self-test runs (t-081195c7cf).
"""
from __future__ import annotations

import json
import math
import time
from datetime import date

from .align import Numbers, decide, rank_sections
from .embed import MODEL
from .maps import CALIBRATION
from .models import Calibration
from .profile import region_vectors, section_vectors
from .sources.canvas import read_canvas
from .sources.gitx import Repo, read_repo

CANVAS = "Harness"
# Each repository with the totem on the Harness canvas that is its plan - checked
# the way a binding with a plan totem places code (t-ea1ec85327). CanvasX is left
# out: its canvas does not hold its whole plan, and its GitX record was added
# after it was built without git or GitX (t-eaf9d9833a).
REPOS = {"E:/Coding CLI/Project Harness": "RAGX", "E:/Coding CLI/Project NoteX": "NoteX"}
WRONG_COST = 2
MAX_SHARED = 3
# A commit that wrote most of the lines of a large share of a repository's
# regions brought code in wholesale (CanvasX began as a copy of File Fabric: one
# commit, 906 of 1,128 regions). A box citing it says the code arrived, not what
# it is, so it is no evidence of which box explains a region (t-03642e423f).
BULK_SHARE = 0.3


def bulk_commits(repo: Repo) -> set[str]:
    n: dict[str, int] = {}
    for r in repo.regions:
        if r.commits:
            n[r.commits[0][0]] = n.get(r.commits[0][0], 0) + 1
    return {sha for sha, k in n.items() if k > BULK_SHARE * len(repo.regions)}


def known_links(repo: Repo, sections) -> dict[str, set[str]]:
    """Which boxes each region is known to belong to, from the boxes' cites."""
    bulk = bulk_commits(repo)
    out: dict[str, set[str]] = {}
    for r in repo.regions:
        claims = set()
        for s in sections:
            for c in s.cites:
                if c.startswith("t-"):
                    hit = c in r.thoughts
                else:
                    hit = any(sha not in bulk and (sha.startswith(c) or c.startswith(sha)) for sha, _ in r.commits)
                if hit:
                    claims.add(s.address)
                    break
        if claims:
            out[r.id] = claims
    return out


def score(places: list[tuple[str, dict]], known: dict[str, set[str]]) -> dict:
    """Each section a region sits in counts once: right when a box citing the
    region is among them, wrong when not. Coverage is the share of known regions
    with at least one right section (t-c045b3953e)."""
    s = dict(known=0, placed=0, shared=0, placements=0, correct=0, wrong=0, covered=0, top1=0)
    for region, p in places:
        k = known.get(region)
        if not k:
            continue
        s["known"] += 1
        s["top1"] += p["best"] in k
        if not p["sections"]:
            continue
        s["placed"] += 1
        s["shared"] += len(p["sections"]) > 1
        right = [x in k for x in p["sections"]]
        s["placements"] += len(right)
        s["correct"] += sum(right)
        s["wrong"] += len(right) - sum(right)
        s["covered"] += any(right)
    s["precision"] = s["correct"] / s["placements"] if s["placements"] else 0
    s["coverage"] = s["covered"] / s["known"] if s["known"] else 0
    s["top1"] = s["top1"] / s["known"] if s["known"] else 0
    return s


def run(write: bool = False, log=print) -> dict:
    canvas = read_canvas(CANVAS)
    sv, _ = section_vectors(canvas)
    known: dict[str, set[str]] = {}
    ranked = []
    boxes = 0
    for d, totem in REPOS.items():
        t0 = time.time()
        repo = read_repo(d)
        rv, made = region_vectors(repo, d)
        # Only the repository's own plan totem: its boxes are the candidates and the answer (t-a9e613798d).
        plan = [s for s in canvas.sections if s.totem == totem]
        boxes += len(plan)
        k = known_links(repo, plan)
        known.update({d + "|" + i: c for i, c in k.items()})
        # Every cosine once, then the grid only decides from the rankings.
        ranked += [(d + "|" + r, rk) for r, rk in rank_sections(rv, {s.address: sv[s.address] for s in plan if s.address in sv})]
        log(f"{d} on totem {totem}: {len(repo.regions)} regions, {len(rv)} with a vector, {len(plan)} boxes, {len(k)} known; {made} embedded in {time.time() - t0:.0f} s")
    decide_all = lambda n: [(r, decide(rk, n)) for r, rk in ranked]

    def search(overlaps):
        best = None
        for si in range(0, 41):
            for mi in range(0, 41):
                for o in overlaps:
                    n = Numbers(min_score=round(si * 0.02, 2), min_margin=round(mi * 0.0025, 4), overlap=o, max_shared=MAX_SHARED)
                    r = score(decide_all(n), known)
                    value = r["correct"] - WRONG_COST * r["wrong"]
                    if best is None or value > best["value"]:
                        best = {"n": n, "value": value, **r}
        return best

    single = search([0.0])
    best = search([round(i * 0.005, 3) for i in range(9)])
    open_ = score(decide_all(Numbers(min_score=-1, min_margin=0)), known)
    pct = lambda x: f"{x * 100:.1f}%"
    line = lambda r: (f"{r['placed']} regions placed ({r['shared']} in more than one section), {r['placements']} placements: "
                      f"{r['correct']} right, {r['wrong']} wrong; precision {pct(r['precision'])}, coverage {pct(r['coverage'])}")
    n = best["n"]
    log(f"\n{len(known)} known regions, {boxes} plan boxes; nearest box right (top-1): {pct(open_['top1'])}")
    log(f"single placement:  min_score {single['n'].min_score}, min_margin {single['n'].min_margin} - {line(single)}")
    log(f"with Venn overlap: min_score {n.min_score}, min_margin {n.min_margin}, overlap {n.overlap} - {line(best)}")

    result = {
        "made": date.today().isoformat(), "model": MODEL, "canvas": CANVAS, "repos": REPOS, "wrongCost": WRONG_COST,
        "minScore": n.min_score, "minMargin": n.min_margin, "overlap": n.overlap, "maxShared": MAX_SHARED,
        "result": {k: (round(best[k], 4) if isinstance(best[k], float) else best[k])
                   for k in ("known", "placed", "shared", "placements", "correct", "wrong", "precision", "coverage")} | {"top1": round(open_["top1"], 4)},
        # The pass mark for aligning AutomatU's own code, fixed here, before it
        # runs: precision at least 90%, coverage at least calibration's own (t-318ebf8e44).
        "selfTest": {"minPrecision": 0.9, "minCoverage": math.ceil(best["coverage"] * 100) / 100,
                     "truth": "the sections of the commits holding at least 20% of a region's lines, from the answer key kept outside the repository"},
    }
    # Checked before it is written, so the file that is loaded later always passes (t-e7dd1752e3).
    result = Calibration.model_validate(result).model_dump()
    if write:
        CALIBRATION.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        log("\nwritten " + str(CALIBRATION))
    return result
