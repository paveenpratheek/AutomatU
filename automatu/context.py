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
from .models import (AddedCanvas, AgentsAnswer, BoxContext, CanvasesAnswer, Decision, Drift, FindAnswer, FoundBox, Hex, MapRef, Notice, NoticesAnswer,
                     RelatedBox, ShelfAnswer, ShelfBox, SinceAnswer, SinceRepo, SinceWrite, StackCommit, StackRegion,
                     TimelineCommit)
from .sources.canvas import read_canvas_script, sections, totem_ids

MAX_STACK = 30      # regions listed under a box; the rest are counted
MAX_DECISIONS = 20


def _superseded(thoughts: dict) -> dict[str, str]:
    """Each thought a later one superseded -> the id of the one that did (t-5df729e232)."""
    return {l["to"]: t.id for t in thoughts.values() for l in (t.links or []) if l.get("type") == "supersedes" and l.get("to")}


# ------------------------------------------------------------- hex locations

def hex_of(canvas: str, script: str, s, ids: dict[str, str] | None = None) -> Hex:
    """A box's lasting place (t-112509dee9): its canvas, its totem by the
    totem's lasting id, and the box."""
    by_name = ids if ids is not None else {name: tid for tid, name in totem_ids(script).items()}
    tid = by_name.get(s.totem) if s.totem else None
    return Hex(ref=f"h:{canvas}/{tid or s.totem or '-'}/{s.name}", canvas=canvas, totem_id=tid, totem=s.totem,
               box=s.name, address=s.address)


def maps_of(canvas: str) -> list[MapRef]:
    """The newest map of each repository bound to this canvas."""
    from .maps import latest_map
    out = []
    for b in all_bindings():
        if b["canvas"] == canvas:
            m = latest_map(b["repo"])
            if m:
                run = m["run"]
                out.append(MapRef(repo=b["repo"], run=run["id"], made_at=_utc(run["made_at"]), head=run["head"][:7]))
    return out


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
    """The canvases the user added - the only ones AutomatU answers about (box 24, t-4fb5a8ff46)."""
    from .canvases import added
    return added()


def _in_automatu(canvas: str) -> None:
    from .canvases import is_added
    if not is_added(canvas):
        raise ValueError(f"the canvas {canvas!r} is not in AutomatU: the user adds it from the Main page "
                         "(Add canvas); in AutomatU now: " + (", ".join(_canvases()) or "none"))


def canvases_answer() -> CanvasesAnswer:
    """The canvases the user added, each with when and the repositories bound
    to it - what Knowledge Desk indexes (box 24)."""
    from .store import db
    rows = db().execute("SELECT canvas, added_at FROM added_canvas ORDER BY canvas").fetchall()
    bound: dict[str, list[str]] = {}
    for b in all_bindings():
        bound.setdefault(b["canvas"], []).append(b["repo"])
    return CanvasesAnswer(canvases=[AddedCanvas(canvas=c, added_at=_utc(at), repos=bound.get(c, [])) for c, at in rows],
                          note="Only these canvases are in AutomatU; the user adds and removes them on its Main page.")


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
    if canvas:
        _in_automatu(canvas)
    canvases = [canvas] if canvas else _canvases()
    found = []
    for c in canvases:
        try:
            script = read_canvas_script(c)
        except RuntimeError:
            if canvas:
                raise
            continue   # an added canvas NoteX cannot read now does not stop the others
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
                      behind=behind, hex=hex_of(c, script, s), maps=maps_of(c),
                      note="Read-only: AutomatU never writes the canvas; change a box through NoteX yourself.")


def shelf(canvas: str) -> ShelfAnswer:
    """Every box of one canvas - bound to a repository or not - with its hex
    location, its words, the commits that built it, the code regions under it
    with their commits, the decisions they carry, and the maps they are as of
    (t-07b5e52886). GitX is read once per bound repository, not once per box."""
    from .maps import latest_map
    from .views import _repo
    if not canvas or not canvas.strip():
        raise ValueError("name a canvas")
    _in_automatu(canvas)
    script = read_canvas_script(canvas)
    secs = sections(script)
    ids = {name: tid for tid, name in totem_ids(script).items()}
    under: dict[str, list] = {}
    plans_of: dict[str, list[str]] = {}
    thoughts: dict[str, object] = {}
    plan_totems: dict[str, list[str]] = {}   # a plan totem's name -> the repositories it plans
    for b in all_bindings():
        if b["canvas"] != canvas:
            continue
        t = plan_totem(b, script)
        if t:
            plan_totems.setdefault(t, []).append(b["repo"])
        m = latest_map(b["repo"])
        if not m:
            continue
        r = _repo(b["repo"])
        thoughts.update(r.thoughts)
        regions = {x.id: x for x in r.regions}
        for p in m["places"]:
            x = regions.get(p["region"])
            for sec in p.get("sections") or []:
                if x is not None:
                    under.setdefault(sec, []).append((r, x))
                    plans_of.setdefault(sec, [])
                    if b["repo"] not in plans_of[sec]:
                        plans_of[sec].append(b["repo"])
    boxes = []
    for s in secs:
        stack, want = [], list(dict.fromkeys(c for c in s.cites if c.startswith("t-")))
        regs = under.get(s.address, [])
        for r, x in regs:
            want += [t for t in x.cites + x.thoughts if t not in want]
            if len(stack) < MAX_STACK:
                cs = [StackCommit(sha=sha[:7], subject=r.commits[sha].subject) for sha, _ in x.commits[:3] if sha in r.commits]
                stack.append(StackRegion(id=x.id, file=x.file, name=x.name, start=x.start, end=x.end, commits=cs))
        decisions = []
        for tid in want:
            t = thoughts.get(tid)
            if t is not None and len(decisions) < MAX_DECISIONS:
                decisions.append(Decision(id=t.id, kind=t.kind, outcome=t.outcome, settled_in=t.resulted[:7], text=t.text[:400],
                                          superseded_by=_superseded(thoughts).get(t.id)))
        boxes.append(ShelfBox(hex=hex_of(canvas, script, s, ids), name=s.name, words=s.words, built_by=list(s.ticks),
                              plans=plans_of.get(s.address, []), regions=stack, regions_more=max(0, len(regs) - len(stack)),
                              decisions=decisions, in_plan=plan_totems.get(s.totem, [])))
    return ShelfAnswer(canvas=canvas, maps=maps_of(canvas), boxes=boxes,
                       note="Read-only: cite a box by its hex ref; open it again with box to see whether it still says the same.")


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
                decisions.append(Decision(id=t.id, kind=t.kind, outcome=t.outcome, settled_in=t.resulted[:7], text=t.text[:400],
                                          superseded_by=_superseded(r.thoughts).get(t.id)))
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
    """The boxes about a subject, by meaning, across every canvas the user added -
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
        try:
            script = read_canvas_script(c)
        except RuntimeError:
            continue
        secs = sections(script)
        ids = {name: tid for tid, name in totem_ids(script).items()}
        vecs, _ = section_vectors(Canvas(name=c, sections=secs))
        for s in secs:
            v = vecs.get(s.address)
            if v is not None:
                hits.append((float(np.dot(q, v)), c, s, hex_of(c, script, s, ids)))
    hits.sort(key=lambda h: -h[0])
    return FindAnswer(query=query, boxes=[FoundBox(canvas=c, address=s.address, name=s.name, score=round(sc, 4), words=s.words[:400],
                                                   hex=h) for sc, c, s, h in hits[:max(1, min(k, 25))]])


# ------------------------------------------------------------- what changed since

def since(when: str | None = None, repo: str | None = None, map: int | None = None) -> SinceAnswer:
    """What changed since a moment, or since a map was made: commits, writes
    to the plan, maps made, notices opened and closed - for one repository or
    all."""
    from .notices import _FIELDS, _row
    from .sources.canvas import canvas_history
    from .store import db
    from .views import _repo
    if map is not None:
        row = db().execute("SELECT made_at FROM map_run WHERE id = %s", (int(map),)).fetchone()
        if not row:
            raise ValueError(f"there is no map {map}")
        when = row[0]
    if when is None or (isinstance(when, str) and not when.strip()):
        raise ValueError("give a moment (ISO time) or a map number")
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
