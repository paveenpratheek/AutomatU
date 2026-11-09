"""What an agent can ask AutomatU (t-5fece0836c), on any platform: the open
notices, everything about one box, the boxes about a subject, what changed
since a moment, and who answers for what. Read-only, like everything AutomatU
serves: it answers, and never writes the canvas, the code or GitX - the agent
writes what it decides, itself (t-ae4cb0d0a9). Each answer is a model from
models.py, so Claude, Gemini or anything else gets the same shape.

These are plain functions; the MCP server (mcp_server.py) only wraps them.
"""
from __future__ import annotations

from .binding import all_bindings, plan_totem
from .models import (AgentsAnswer, BoxContext, Decision, Drift, FindAnswer, FoundBox, Notice, NoticesAnswer, RelatedBox,
                     SinceAnswer, SinceRepo, SinceWrite, StackCommit, StackRegion, TimelineCommit)
from .sources.canvas import read_canvas_script, sections

MAX_STACK = 30      # regions listed under a box; the rest are counted
MAX_DECISIONS = 20


def _utc(t) -> str:
    from .timeline import utc
    return utc(t)


def resolve_repo(name: str | None) -> str | None:
    """A bound repository from its path or its folder's name, any case."""
    if not name:
        return None
    want = name.replace("\\", "/").rstrip("/").lower()
    for b in all_bindings():
        if b["repo"].lower() == want or b["repo"].split("/")[-1].lower() == want:
            return b["repo"]
    raise ValueError(f"no bound repository called {name!r}; bound: " + ", ".join(b["repo"].split("/")[-1] for b in all_bindings()))


def _canvases() -> list[str]:
    return sorted({b["canvas"] for b in all_bindings()})


# ------------------------------------------------------------- notices and agents

def notices_for(repo: str | None = None, agent: str | None = None) -> NoticesAnswer:
    """The open notices - for a repository, for the repositories an agent
    answers for, or for all - and the newest closed."""
    from .notices import agents, notices
    repos: list[str | None]
    if agent:
        mine = next((a for a in agents() if a["agent"] == agent), None)
        if not mine:
            raise ValueError(f"{agent} answers for no repository: automatu agent register REPO --agent {agent}")
        repos = [r["repo"] for r in mine["repos"]]
        if repo:
            repos = [r for r in repos if r == resolve_repo(repo)]
    else:
        repos = [resolve_repo(repo)]
    parts = [notices(r, closed=5) for r in repos]
    out = {"count": sum(p["count"] for p in parts), "behind": [], "progress": [], "closed": []}
    for p in parts:
        for k in ("behind", "progress", "closed"):
            out[k] += p[k]
    return NoticesAnswer.model_validate(out)


def agents_answer() -> AgentsAnswer:
    from .notices import agents
    return AgentsAnswer.model_validate({"agents": agents()})


# ------------------------------------------------------------- one box

def match_box(secs: list, box: str) -> object:
    """A box by its full address, its exact name, or a name it alone contains;
    "13" finds "13. Notices and agents". Several matches are named back."""
    want = box.strip().lower()
    for test in (lambda s: s.address.lower() == want,
                 lambda s: s.name.lower() == want,
                 lambda s: s.name.lower().startswith(want + ".") or s.name.lower().startswith(want + " "),
                 lambda s: want in s.name.lower()):
        hits = [s for s in secs if test(s)]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            raise ValueError(f"{box!r} could be any of: " + "; ".join(f"{s.address}" for s in hits[:12]))
    raise ValueError(f"no box called {box!r}")


def box_context(box: str, canvas: str | None = None) -> BoxContext:
    """Everything about one box: its words, the code stacked under it, its
    related boxes and why, the decisions its words and code carry, and
    whether it is behind."""
    canvases = [canvas] if canvas else _canvases()
    found = []
    for c in canvases:
        script = read_canvas_script(c)
        try:
            found.append((c, script, match_box(sections(script), box)))
        except ValueError as e:
            if "could be any of" in str(e):
                raise
    if not found:
        raise ValueError(f"no box called {box!r} on " + ", ".join(canvases))
    if len(found) > 1:
        raise ValueError(f"{box!r} is on several canvases - name one: " + ", ".join(f"{c}: {s.address}" for c, _, s in found))
    c, script, s = found[0]
    plans = [b["repo"] for b in all_bindings() if b["canvas"] == c and plan_totem(b, script) in (None, s.totem)]
    stack, more, decisions, behind = _stack(plans, s)
    return BoxContext(canvas=c, address=s.address, name=s.name, words=s.words, built_by=list(s.ticks),
                      plans=plans, stack=stack, stack_more=more, related=_related(c, s.address), decisions=decisions,
                      behind=behind,
                      note="Read-only: AutomatU never writes the canvas; change a box through NoteX yourself.")


def _stack(plans: list[str], s) -> tuple[list[StackRegion], int, list[Decision], Drift | None]:
    from .maps import latest_map
    from .notices import notices
    from .views import _repo
    stack: list[StackRegion] = []
    count = 0
    want: list[str] = list(dict.fromkeys(c for c in s.cites if c.startswith("t-")))
    behind = None
    for repo in plans:
        m = latest_map(repo)
        if not m:
            continue
        r = _repo(repo)
        regions = {x.id: x for x in r.regions}
        under = [p["region"] for p in m["places"] if s.address in (p.get("sections") or [])]
        count += len(under)
        for rid in under:
            x = regions.get(rid)
            if not x:
                continue
            want += [t for t in x.cites + x.thoughts if t not in want]
            if len(stack) < MAX_STACK:
                cs = [StackCommit(sha=sha[:7], subject=r.commits[sha].subject) for sha, _ in x.commits[:3] if sha in r.commits]
                stack.append(StackRegion(id=x.id, file=x.file, name=x.name, start=x.start, end=x.end, commits=cs))
        n = notices(repo, closed=0)
        hit = next((x for x in n["behind"] + n["progress"] if x["box"] == s.address), None)
        if hit:
            behind = Drift(id=hit["id"], box=hit["box"], behind=hit["behind"], progress=hit["progress"],
                           commits=[c for c in hit["commits"] if c["state"] != "ticked"])
        decisions = []
        for tid in want:
            t = r.thoughts.get(tid)
            if t and len(decisions) < MAX_DECISIONS:
                decisions.append(Decision(id=t.id, kind=t.kind, outcome=t.outcome, settled_in=t.resulted[:7], text=t.text[:400]))
        return stack, max(0, count - len(stack)), decisions, behind
    return stack, 0, [], behind


def _related(canvas: str, address: str) -> list[RelatedBox]:
    from .relations import relations
    try:
        rel = relations(canvas)
    except RuntimeError:
        return []
    out = []
    for e in sorted(rel["edges"], key=lambda e: -e["w"]):
        if address in (e["a"], e["b"]):
            out.append(RelatedBox(box=e["b"] if e["a"] == address else e["a"], by=e["by"], why=e["why"]))
    return out[:12]


# ------------------------------------------------------------- the boxes about a subject

def find_boxes(query: str, k: int = 8) -> FindAnswer:
    """The boxes about a subject, by meaning, across every bound canvas -
    the same local embeddings alignment uses."""
    import numpy as np

    from .embed import embed_texts, normalise
    from .profile import section_vectors
    from .sources.canvas import Canvas
    if not query or not query.strip():
        raise ValueError("give a subject to look for")
    q = normalise(embed_texts([query.strip()])[0])
    hits = []
    for c in _canvases():
        secs = sections(read_canvas_script(c))
        vecs, _ = section_vectors(Canvas(name=c, sections=secs))
        for s in secs:
            v = vecs.get(s.address)
            if v is not None:
                hits.append((float(np.dot(q, v)), c, s))
    hits.sort(key=lambda h: -h[0])
    return FindAnswer(query=query, boxes=[FoundBox(canvas=c, address=s.address, name=s.name, score=round(sc, 4), words=s.words[:400])
                                          for sc, c, s in hits[:max(1, min(k, 25))]])


# ------------------------------------------------------------- what changed since

def since(when: str, repo: str | None = None) -> SinceAnswer:
    """What changed since a moment: commits, writes to the plan, maps made,
    notices opened and closed - for one repository or all."""
    from .notices import _FIELDS, _row
    from .sources.canvas import canvas_history
    from .store import db
    from .views import _repo
    t = _utc(when)
    only = resolve_repo(repo)
    repos = []
    for b in all_bindings():
        if only and b["repo"] != only:
            continue
        r = _repo(b["repo"])
        commits = sorted((TimelineCommit(sha=c.sha[:7], at=_utc(c.at), subject=c.subject) for c in r.commits.values()
                          if c.at and _utc(c.at) > t), key=lambda c: c.at)
        writes = [SinceWrite(at=_utc(w["at"]), by=w.get("who") or "", totems=(w.get("added") or []) + (w.get("changed") or []))
                  for w in canvas_history(b["canvas"]).get("commits") or [] if _utc(w["at"]) > t]
        maps = db().execute("SELECT count(*) FROM map_run WHERE repo = %s AND made_at > %s", (b["repo"], t)).fetchone()[0]
        repos.append(SinceRepo(repo=b["repo"], canvas=b["canvas"], commits=commits, plan_writes=sorted(writes, key=lambda w: w.at), maps=maps))
    cols = ", ".join(_FIELDS)
    where, args = (" AND repo = %s", (only,)) if only else ("", ())
    opened = [Notice.model_validate(_row(x)) for x in db().execute(f"SELECT {cols} FROM notice WHERE opened_at > %s{where} ORDER BY opened_at", (t,) + args)]
    closed = [Notice.model_validate(_row(x)) for x in db().execute(f"SELECT {cols} FROM notice WHERE closed_at > %s{where} ORDER BY closed_at", (t,) + args)]
    return SinceAnswer(since=t, repos=repos, notices_opened=opened, notices_closed=closed)
