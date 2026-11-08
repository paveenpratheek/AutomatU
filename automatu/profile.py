"""What a region and a section are judged by, as vectors.

A region: the messages of the commits whose lines are still in it, weighted by
those lines, mixed half and half with the thoughts linked to it. A thought cited
in the region's own comments counts in full; one linked through a commit counts
as much as that commit wrote of the region (t-4c1745c814). Thoughts that are
rejected, stashed or superseded are left out: they say what the code does not do
(t-35ef1da3a9).

A section: its own words.
"""
from __future__ import annotations

import numpy as np

from .embed import embed_cached, normalise
from .sources.canvas import Canvas
from .sources.gitx import Repo, Thought

DROP = {"rejected", "stashed"}


def live_thoughts(thoughts: dict[str, Thought]) -> dict[str, Thought]:
    superseded = {l["to"] for t in thoughts.values() for l in t.links if l.get("type") == "supersedes"}
    return {i: t for i, t in thoughts.items() if t.outcome not in DROP and i not in superseded}


def mix(parts: list[tuple[np.ndarray | None, float]]) -> np.ndarray | None:
    """A weighted sum of vectors, normalised; None when nothing has weight."""
    out = None
    for v, w in parts:
        if v is None or not w:
            continue
        out = v * w if out is None else out + v * w
    return normalise(out) if out is not None else None


def region_vectors(repo: Repo, key: str) -> tuple[dict[str, np.ndarray], int]:
    """The vector of every region something was said about, and how many
    embeddings had to be made. key: the repository's binding key."""
    live = live_thoughts(repo.thoughts)
    items = [("commit:" + key + ":" + c.sha, c.text) for c in repo.commits.values()]
    items += [("thought:" + key + ":" + t.id, t.text) for t in live.values()]
    vectors, made = embed_cached(items)

    out: dict[str, np.ndarray] = {}
    for r in repo.regions:
        total = sum(n for _, n in r.commits) or 1
        share = {sha: n / total for sha, n in r.commits}
        commit_part = mix([(vectors.get("commit:" + key + ":" + sha), share[sha]) for sha, _ in r.commits])
        thought_part = mix([
            (vectors.get("thought:" + key + ":" + i), max(share.get(live[i].resulted, 0), share.get(live[i].commit, 0)) or 1)
            for i in r.thoughts if i in live
        ])
        v = mix([(commit_part, 0.5), (thought_part, 0.5)])
        if v is not None:
            out[r.id] = v
    return out, made


def section_vectors(canvas: Canvas) -> tuple[dict[str, np.ndarray], int]:
    key = lambda s: "section:" + canvas.name + ":" + s.address
    vectors, made = embed_cached([(key(s), s.words) for s in canvas.sections])
    return {s.address: normalise(vectors[key(s)]) for s in canvas.sections if key(s) in vectors}, made
