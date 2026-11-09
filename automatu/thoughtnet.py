"""One code region's thoughts, for the map view's thought graph (t-b2c1b5bfcc).

The members are chosen as the SearchX prototype chose them (t-d6eb35c57d):
every thought the region's own code cites today, then the thoughts linked to
those - either way round - then up to VIA_COMMIT of the thoughts recorded on
the commits whose lines are still in it, current ones first; at most CAP in
all. Edges: the region to each thought it cites (solid) and to each one
recorded on its commits (thin), and GitX's own links between the members.

A thought is current when some code in the repository cites it today, and
history otherwise. Everything is read from GitX when asked; nothing is stored.
"""
from __future__ import annotations

from .sources.gitx import Repo

CAP = 64
VIA_COMMIT = 24


def region_net(repo: Repo, region_id: str) -> dict | None:
    r = next((x for x in repo.regions if x.id == region_id), None)
    if r is None:
        return None
    T = repo.thoughts
    # A thought counts as current while some code at HEAD still cites it.
    cited_now = {t for x in repo.regions for t in x.cites}
    back: dict[str, list[str]] = {}
    for t in T.values():
        for l in t.links:
            back.setdefault(l["to"], []).append(t.id)

    role: dict[str, str] = {}
    order: list[str] = []

    def add(tid: str, why: str) -> None:
        if tid in T and tid not in role and len(order) < CAP:
            role[tid] = why
            order.append(tid)

    for tid in r.cites:
        add(tid, "cited")
    for tid in [t for t in order]:
        for l in T[tid].links:
            add(l["to"], "linked")
        for frm in back.get(tid, []):
            add(frm, "linked")
    shas = {sha for sha, _ in r.commits}
    via = [tid for tid, t in T.items() if t.commit in shas or t.resulted in shas]
    via.sort(key=lambda tid: (tid not in cited_now, tid))
    for tid in via[:VIA_COMMIT]:
        add(tid, "commit")

    edges = [{"a": "#", "b": tid, "kind": "cites" if role[tid] == "cited" else "commit"}
             for tid in order if role[tid] in ("cited", "commit")]
    for tid in order:
        for l in T[tid].links:
            if l["to"] in role:
                edges.append({"a": tid, "b": l["to"], "kind": l.get("type") or "link"})

    def commit(sha: str) -> list[str] | None:
        c = repo.commits.get(sha)
        return [c.date, c.subject] if c else None

    thoughts = {}
    for tid in order:
        t = T[tid]
        thoughts[tid] = {"kind": t.kind, "outcome": t.outcome, "graph": t.graph, "text": t.text,
                         "current": tid in cited_now, "role": role[tid],
                         "recorded": t.commit[:7], "recorded_on": commit(t.commit) if t.commit else None,
                         "settled": t.resulted[:7], "settled_in": commit(t.resulted) if t.resulted else None,
                         "links": [[l.get("type") or "link", l["to"]] for l in t.links]}
    return {
        "region": {"id": r.id, "file": r.file, "name": r.name, "lines": [r.start, r.end]},
        "commits": [{"sha": sha[:7], "date": (commit(sha) or ["", ""])[0], "subject": (commit(sha) or ["", ""])[1]}
                    for sha, _ in r.commits],
        "order": order,
        "thoughts": thoughts,
        "edges": edges,
    }
