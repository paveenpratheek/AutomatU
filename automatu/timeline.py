"""The plan in time (t-25f10ce5fd): a bound repository's phases, the plan as
it stood at any moment, and the boxes whose code moved on while their words
did not.

  phase      the span while one binding stood - one canvas and one plan
             totem - from the binding log (t-f9d9da8298); inside it, every
             write NoteX kept that changed the plan totem is a plan version
  moment     the plan's boxes as the canvas history gives them for a time,
             with what the version before it said
  boxes      followed from version to version by name, and a box that
             vanished while another appeared is the same box renamed when
             most of its lines carried over - as git follows lines, not names
  drift      a box whose code was changed, after its words last changed, by
             commits made for another box - the box holding most of the code
             that commit still owns (t-e8ed35d743)

Clocks (t-1660f9a7e6): commits by committer time, thoughts by when GitX
recorded them, plan versions by NoteX's write, maps by when they were made;
all compared in UTC. Everything is read from GitX, NoteX and the maps when
asked; nothing is copied.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from .binding import all_bindings, binding_history
from .maps import latest_map
from .sources.canvas import canvas_history, read_canvas_at, sections
from .store import db

BULK = 0.30          # a commit behind more than this share of the regions is no one box's work
RENAME_OVERLAP = 0.5  # a vanished and a new box are one box renamed when this share of lines carried over

_scripts: dict[tuple[str, str], str] = {}
_lock = threading.Lock()


def utc(t) -> str:
    """Any time as ISO in UTC, to the millisecond, for comparing clocks."""
    if isinstance(t, datetime):
        d = t
    else:
        d = datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _script_at(canvas: str, when: str) -> dict:
    """The canvas at a moment; a write's scripts never change, so each is read once."""
    got = read_canvas_at(canvas, when)
    key = (canvas, got.get("commit") or "")
    with _lock:
        if key[1] and key not in _scripts:
            _scripts[key] = got["script"]
    return got


def _plan_boxes(script: str, totem: str | None) -> dict[str, str]:
    """The plan's boxes, address -> words, for a plan totem (every box when none)."""
    return {s.address: s.words for s in sections(script) if totem is None or s.totem == totem}


def _short(address: str) -> str:
    return address.split(" > ")[-1]


def follow(before: dict[str, str], after: dict[str, str]) -> dict:
    """What changed between two versions of a plan, boxes followed by their
    lines: added, removed, reworded and renamed (old -> new)."""
    gone = [a for a in before if a not in after]
    new = [a for a in after if a not in before]
    renamed: dict[str, str] = {}
    for g in gone:
        lines_g = {l for l in before[g].splitlines()[1:] if l.strip()}
        best, share = None, 0.0
        for n in new:
            if n in renamed.values():
                continue
            lines_n = {l for l in after[n].splitlines()[1:] if l.strip()}
            if lines_g and lines_n:
                s = len(lines_g & lines_n) / max(len(lines_g), len(lines_n))
                if s > share:
                    best, share = n, s
        if best and share >= RENAME_OVERLAP:
            renamed[g] = best
    return {"added": [n for n in new if n not in renamed.values()],
            "removed": [g for g in gone if g not in renamed],
            "renamed": [[g, n] for g, n in renamed.items()],
            "reworded": [a for a in after if a in before and before[a] != after[a]]}


def _phases(repo: str, first_commit: str | None = None) -> list[dict]:
    """One phase per binding. A rebuilt binding's time is only the first map
    that shows it, so it is tightened by the other clocks: the first phase
    starts at the canvas's first write or the repository's first commit,
    whichever came first, and a later one when its plan totem was made on the
    canvas, if that came after the map before it (t-f9d9da8298)."""
    log = binding_history(repo)
    starts = [utc(b["at"]) for b in log]
    writes = {}
    for b in {x["canvas"] for x in log}:
        writes[b] = sorted(canvas_history(b).get("commits") or [], key=lambda c: c["at"])
    for i, b in enumerate(log):
        if not b["rebuilt"]:
            continue
        w = writes.get(b["canvas"]) or []
        if i == 0:
            firsts = [utc(w[0]["at"])] if w else []
            if first_commit:
                firsts.append(utc(first_commit))
            if firsts:
                starts[0] = min([starts[0]] + firsts)
        elif b["totem"]:
            made = next((utc(x["at"]) for x in w if b["totem"] in (x.get("added") or [])), None)
            if made and starts[i - 1] < made < starts[i]:
                starts[i] = made
    out = []
    for i, b in enumerate(log):
        out.append({"canvas": b["canvas"], "totem": b["totem"], "start": starts[i], "end": starts[i + 1] if i + 1 < len(log) else None,
                    "rebuilt": b["rebuilt"], "note": b["note"]})
    return out


def _versions(canvas: str, phase: dict) -> list[str]:
    """The times of the writes that changed the phase's plan totem, inside the
    phase - its name carried through renames as the writes go by."""
    writes = sorted(canvas_history(canvas).get("commits") or [], key=lambda c: c["at"])
    name, out = phase["totem"], []
    for w in writes:
        for frm, to in (w.get("renamed") or []):
            if frm == name:
                name = to
        touched = name is None or name in (w.get("added") or []) + (w.get("changed") or []) + [to for _, to in (w.get("renamed") or [])]
        if touched and w["at"] < (phase["end"] or "9999") and w["at"] >= phase["start"]:
            out.append(utc(w["at"]))
    return out


def timeline(repo: str) -> dict:
    """Everything with a time for a bound repository, grouped by phase."""
    from .views import _repo
    b = next((x for x in all_bindings() if x["repo"] == repo), None)
    if not b:
        raise ValueError("not a repository bound to a canvas")
    r = _repo(repo)
    phases = _phases(repo, _first_commit(r))
    runs = db().execute("SELECT id, made_at, head, placed, regions FROM map_run WHERE repo = %s ORDER BY made_at, id", (repo,)).fetchall()
    commits = sorted(({"sha": c.sha[:7], "at": utc(c.at), "subject": c.subject} for c in r.commits.values() if c.at),
                     key=lambda c: c["at"])
    thoughts = sorted(({"id": t.id, "at": utc(t.created), "kind": t.kind, "outcome": t.outcome, "settled": t.resulted[:7],
                        "text": t.text[:160]} for t in r.thoughts.values() if t.created), key=lambda t: t["at"])
    maps = [{"id": i, "at": utc(at), "head": h[:7], "placed": p, "regions": n} for i, at, h, p, n in runs]
    for ph in phases:
        inside = lambda t: t >= ph["start"] and (ph["end"] is None or t < ph["end"])
        ph["versions"] = _versions(ph["canvas"], ph)
        ph["commits"] = sum(1 for c in commits if inside(c["at"]))
        ph["thoughts"] = sum(1 for t in thoughts if inside(t["at"]))
        ph["settled"] = sum(1 for t in r.thoughts.values() if t.created and inside(utc(t.created)) and t.resulted)
        ph["maps"] = sum(1 for m in maps if inside(m["at"]))
    return {"repo": repo, "canvas": b["canvas"], "now": utc(datetime.now(timezone.utc)), "phases": phases,
            "commits": commits, "thoughts": thoughts, "maps": maps, "drift": drift(repo, b, phases, r)}


def plan_at(repo: str, when: str) -> dict:
    """The plan as it stood at a moment: its canvas and plan totem from the
    binding log, its boxes from the canvas history, and what the version
    before it said."""
    from .views import _repo
    when = utc(when)
    phase = next((p for p in reversed(_phases(repo, _first_commit(_repo(repo)))) if p["start"] <= when), None)
    if not phase:
        return {"when": when, "phase": None, "boxes": [], "changed": None}
    now = _script_at(phase["canvas"], when)
    boxes = _plan_boxes(now["script"], phase["totem"])
    earlier = [v for v in _versions(phase["canvas"], phase) if v <= when]
    changed = None
    if earlier:
        last = earlier[-1]
        prev = read_canvas_at(phase["canvas"], _just_before(last))
        if prev.get("commit"):
            changed = {"at": last, **follow(_plan_boxes(prev["script"], phase["totem"]), boxes)}
    return {"when": when, "phase": phase, "written": now.get("written"), "by": now.get("by"),
            "boxes": [{"address": a, "name": _short(a), "words": w} for a, w in boxes.items()], "changed": changed}


def _first_commit(r) -> str | None:
    ats = [c.at for c in r.commits.values() if c.at]
    return min(ats, key=utc) if ats else None


def _just_before(t: str) -> str:
    d = datetime.fromisoformat(t.replace("Z", "+00:00"))
    return utc(datetime.fromtimestamp(d.timestamp() - 0.001, timezone.utc))


def drift(repo: str, binding: dict, phases: list[dict], r) -> list[dict]:
    """Plan boxes whose code was changed by commits made for another box after
    the box's own words last changed - code changed, plan not (t-e8ed35d743)."""
    m = latest_map(repo)
    if not m or not phases:
        return []
    ph = phases[-1]
    versions = _versions(ph["canvas"], ph)
    # When each box's words last changed, the box followed through renames.
    last_changed: dict[str, str] = {}
    prev: dict[str, str] | None = None
    for v in versions:
        boxes = _plan_boxes(_script_at(ph["canvas"], v)["script"], ph["totem"])
        if prev is None:
            for a in boxes:
                last_changed[a] = v
        else:
            ch = follow(prev, boxes)
            for old, new in ch["renamed"]:
                last_changed[new] = last_changed.pop(old, v)
            for a in ch["added"] + ch["reworded"]:
                last_changed[a] = v
        prev = boxes
    # The box each commit was made for: where most of the code it still owns is placed.
    under: dict[str, str] = {}
    for p in m["places"]:
        if p["section"]:
            under[p["region"]] = p["section"]
    regions = {x.id: x for x in r.regions}
    owns: dict[str, dict[str, int]] = {}
    count: dict[str, int] = {}
    for rid, box in under.items():
        x = regions.get(rid)
        for sha, n in (x.commits if x else []):
            owns.setdefault(sha, {}).setdefault(box, 0)
            owns[sha][box] += n
            count[sha] = count.get(sha, 0) + 1
    bulk = {sha for sha, n in count.items() if n > BULK * max(1, len(under))}
    made_for = {sha: max(bx.items(), key=lambda kv: kv[1])[0] for sha, bx in owns.items()}
    out = []
    for box, since in last_changed.items():
        mine = [rid for rid, b in under.items() if b == box]
        seen, why = set(), []
        for rid in mine:
            x = regions.get(rid)
            for sha, _ in (x.commits if x else []):
                c = r.commits.get(sha)
                if not c or sha in seen or sha in bulk or not c.at or utc(c.at) <= since:
                    continue
                seen.add(sha)
                if made_for.get(sha) and made_for[sha] != box:
                    why.append({"sha": sha[:7], "at": utc(c.at), "subject": c.subject, "made_for": made_for[sha]})
        if why:
            out.append({"box": box, "words_changed": since, "commits": sorted(why, key=lambda w: w["at"])})
    return out
