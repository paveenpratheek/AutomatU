"""Notices and agents (box 13): which plan boxes the code has moved past, kept
as rows in Postgres, and which agents answer for which repository.

  built      a box is built once its words hold an "[x]" line naming a commit
             (t-5f4103c65a); before that it is being built and raises nothing
  open       a built box is open for work when a plan version changes its
             words after its last tick - the workflow plans before it builds
             (t-b620bd3f41)
  behind     a commit changed code placed under a built box that was not open:
             the code moved past the plan, whichever box the commit was for
  progress   a commit changed code under an open box: held, not rung
  ticked     a later tick on the same box names a commit made at or after it:
             the work is built and written down, so it comes off (t-e64da7fa33)

One open row per box holds every commit it is behind or has in progress, with
the regions they changed (t-3f31f11ef2); a box behind again after its row was
closed gets a new row. A row closes when an agent says what it did, or by
itself when every commit on it was ticked; nothing closes by time. No commit
names its box: all of this comes from AutomatU's own metadata - the map's
placements, the canvas history and these rows (t-a0575e7e36).
"""
from __future__ import annotations

from psycopg.types.json import Jsonb
from pydantic import ValidationError

from .models import NoticeCommit

from .binding import binding_of, repo_key
from .store import db

BULK = 0.30  # a commit behind more than this share of the placed regions is no one box's work (t-b4d0fcb0db)
HOWS = ("done", "still-right", "ignored")


def _utc(t) -> str:
    from .timeline import utc
    return utc(t)


# ------------------------------------------------------------- the rule

def box_events(versions: list[tuple[str, list]]) -> tuple[dict[str, list[dict]], dict[str, str]]:
    """What happened to each plan box from version to version, oldest first:
    added, tick (new commits named on its "[x]" lines) or reword. versions are
    (time, the plan's sections then). Boxes are followed by their lines, so a
    renamed box keeps its history; returns the events by each box's newest
    address, and every older address it had -> its newest."""
    from .timeline import follow
    events: dict[str, list[dict]] = {}
    alias: dict[str, str] = {}
    prev_words: dict[str, str] | None = None
    prev_ticks: dict[str, set[str]] = {}
    for at, secs in versions:
        at = _utc(at)
        words = {s.address: s.words for s in secs}
        ticks = {s.address: set(s.ticks) for s in secs}
        if prev_words is None:
            added = list(words)
        else:
            ch = follow(prev_words, words)
            for old, new in ch["renamed"]:
                events[new] = events.pop(old, [])
                prev_ticks[new] = prev_ticks.pop(old, set())
                prev_words[new] = prev_words.pop(old)
                for k, v in list(alias.items()):
                    if v == old:
                        alias[k] = new
                alias[old] = new
            added = ch["added"]
        for a in words:
            ev = events.setdefault(a, [])
            if a in added:
                ev.append({"at": at, "kind": "added", "ticks": []})
                if ticks[a]:
                    ev.append({"at": at, "kind": "tick", "ticks": sorted(ticks[a])})
                continue
            new_ticks = ticks[a] - prev_ticks.get(a, set())
            if new_ticks:
                ev.append({"at": at, "kind": "tick", "ticks": sorted(new_ticks)})
            elif prev_words is not None and _body(words[a]) != _body(prev_words.get(a, "")):
                ev.append({"at": at, "kind": "reword", "ticks": []})
        prev_words, prev_ticks = words, ticks
    return events, alias


def _body(words: str) -> str:
    """A box's words without its name, so a rename alone is not a reword."""
    return words.split("\n", 1)[1] if "\n" in words else ""


def state_at(events: list[dict], t: str) -> str | None:
    """What a commit at time t was to a box: None while the box was not built
    yet, "progress" while it was open for work, else "behind"."""
    t = _utc(t)
    ticks = [e["at"] for e in events if e["kind"] == "tick" and e["at"] <= t]
    if not ticks:
        return None
    rewords = [e["at"] for e in events if e["kind"] == "reword" and e["at"] <= t]
    return "progress" if rewords and max(rewords) > max(ticks) else "behind"


def ticked_by(events: list[dict], t: str, commit_at) -> str | None:
    """The commit a later tick on the box named that covers a commit at time t:
    one made at or after it, ticked after it. commit_at(sha) gives a commit's
    time, or None when the repository does not know it."""
    t = _utc(t)
    for e in events:
        if e["kind"] != "tick" or e["at"] < t:
            continue
        for sha in e["ticks"]:
            ct = commit_at(sha)
            if ct is None or _utc(ct) >= t:
                return sha
    return None


def box_commits(places: list[dict], repo) -> dict[str, list[tuple[str, list]]]:
    """For each plan box, the commits whose lines are in the code placed under
    it, with the regions each is in. A commit behind most of the code at once
    is no one box's work and is left out."""
    regions = {x.id: x for x in repo.regions}
    under: dict[str, list[str]] = {}
    for p in places:
        for box in (p.get("sections") or ([p["section"]] if p.get("section") else [])):
            under.setdefault(box, []).append(p["region"])
    placed = {rid for rids in under.values() for rid in rids}
    count: dict[str, int] = {}
    for rid in placed:
        for sha, _ in (regions[rid].commits if rid in regions else []):
            count[sha] = count.get(sha, 0) + 1
    bulk = {sha for sha, n in count.items() if n > BULK * max(1, len(placed))}
    out: dict[str, list[tuple[str, list]]] = {}
    for box, rids in under.items():
        by_sha: dict[str, list] = {}
        for rid in rids:
            x = regions.get(rid)
            for sha, _ in (x.commits if x else []):
                if sha not in bulk:
                    by_sha.setdefault(sha, []).append(x)
        out[box] = list(by_sha.items())
    return out


def compute(repo_dir: str) -> tuple[list[dict], dict[str, str], object]:
    """Every commit a built box is behind or has in progress, with its state
    now, from the newest map and the plan's versions in the current phase."""
    from .maps import latest_map
    from .sources.canvas import sections
    from .timeline import _first_commit, _phases, _script_at, _versions
    from .views import _repo
    key = repo_key(repo_dir)
    m = latest_map(key)
    if not m:
        return [], {}, None
    r = _repo(key)
    phases = _phases(key, _first_commit(r))
    if not phases:
        return [], {}, None
    ph = phases[-1]
    versions = []
    for v in _versions(ph["canvas"], ph):
        secs = [s for s in sections(_script_at(ph["canvas"], v)["script"]) if ph["totem"] is None or s.totem == ph["totem"]]
        versions.append((v, secs))
    events, alias = box_events(versions)

    def commit_at(sha: str):
        c = r.commits.get(sha) or next((c for k, c in r.commits.items() if k.startswith(sha)), None)
        return c.at if c and c.at else None

    items = []
    for box, commits in box_commits(m["places"], r).items():
        ev = events.get(alias.get(box, box))
        if not ev:
            continue
        for sha, regs in commits:
            c = r.commits.get(sha)
            if not c or not c.at:
                continue
            state = state_at(ev, c.at)
            if not state:
                continue
            items.append({"box": alias.get(box, box), "sha": sha[:12], "at": _utc(c.at), "subject": c.subject, "state": state,
                          "ticked_by": ticked_by(ev, c.at, commit_at),
                          "regions": [{"id": x.id, "file": x.file, "name": x.name, "start": x.start, "end": x.end} for x in regs]})
    def judge(box: str, at: str) -> str | None:
        """A later tick on the box covering a commit made at this time - for a
        commit on an open notice whose code the newest map no longer places
        under the box (t-dca07bb8c7)."""
        ev = events.get(alias.get(box, box))
        return ticked_by(ev, at, commit_at) if ev else None

    return sorted(items, key=lambda i: i["at"]), alias, judge


# ------------------------------------------------------------- the rows

def merge(repo: str, items: list[dict], alias: dict[str, str] | None = None, judge=None) -> dict:
    """Brings the rows up to date with what compute found: a commit not on any
    row for its box joins the box's open row (made when there is none); a
    commit already ticked when first seen is built work and is not recorded; a
    later tick marks it ticked, and a row whose commits are all ticked closes
    itself. A commit on an open row that compute no longer reports - its code
    moved out from under the box on a later map - is judged by the box's ticks
    all the same, so it can never be held open for ever. Returns how many
    commits were added and rows closed."""
    conn = db()
    added = closed = 0
    with conn.transaction():
        # One refresh of a repository at a time: the map server's watcher and a
        # command run by hand could both open a row for the same box, and the
        # loser's whole transaction was rolled back (t-3f31f11ef2).
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("automatu-notices:" + repo,))
        for old, new in (alias or {}).items():
            if old != new:
                conn.execute("UPDATE notice SET box = %s WHERE repo = %s AND box = %s AND NOT EXISTS "
                             "(SELECT 1 FROM notice n WHERE n.repo = %s AND n.box = %s AND n.status = 'open')", (new, repo, old, repo, new))
        rows = conn.execute("SELECT id, box, status, commits FROM notice WHERE repo = %s FOR UPDATE", (repo,)).fetchall()
        known = {(box, c["sha"]) for _, box, _, cs in rows for c in cs}
        open_row = {box: [i, list(cs), False] for i, box, st, cs in rows if st == "open"}
        for it in items:
            box = it["box"]
            if (box, it["sha"]) in known:
                row = open_row.get(box)
                if row and it["ticked_by"]:
                    for c in row[1]:
                        if c["sha"] == it["sha"] and c["state"] != "ticked":
                            c["state"], c["ticked_by"], row[2] = "ticked", it["ticked_by"], True
                continue
            if it["ticked_by"]:
                continue  # built and ticked before AutomatU saw it: nothing to tell
            # Checked before anything is written: a bad entry is refused, its field named (t-e7dd1752e3).
            entry = _checked(box, [{k: it[k] for k in ("sha", "at", "subject", "state", "regions")} | {"ticked_by": None}])[0]
            row = open_row.get(box)
            if not row:
                nid = conn.execute("INSERT INTO notice (repo, box) VALUES (%s, %s) RETURNING id", (repo, box)).fetchone()[0]
                row = open_row[box] = [nid, [], False]
            row[1].append(entry)
            row[2] = True
            known.add((box, it["sha"]))
            added += 1
        seen = {(it["box"], it["sha"]) for it in items}
        for box, row in open_row.items():
            for c in row[1]:
                if c["state"] != "ticked" and (box, c["sha"]) not in seen and judge:
                    by = judge(box, c["at"])
                    if by:
                        c["state"], c["ticked_by"], row[2] = "ticked", by, True
        for box, (nid, cs, dirty) in open_row.items():
            if not dirty:
                continue
            cs = _checked(box, sorted(cs, key=lambda c: c["at"]))
            if cs and all(c["state"] == "ticked" for c in cs):
                conn.execute("UPDATE notice SET commits = %s, updated_at = now(), status = 'closed', closed_at = now(), closed_by = 'AutomatU', "
                             "closed_how = 'ticked', closed_note = %s WHERE id = %s",
                             (Jsonb(cs), "every commit on it was ticked on the box", nid))
                closed += 1
            else:
                conn.execute("UPDATE notice SET commits = %s, updated_at = now() WHERE id = %s", (Jsonb(cs), nid))
    return {"added": added, "closed": closed}


def _checked(box: str, commits: list[dict]) -> list[dict]:
    """A notice's commits as the model says they must be, or a ValueError
    naming the box, the entry and the field."""
    out = []
    for c in commits:
        try:
            out.append(NoticeCommit.model_validate(c).model_dump())
        except ValidationError as e:
            where = "; ".join(f"{'.'.join(str(x) for x in err['loc']) or 'the entry'}: {err['msg']}" for err in e.errors())
            raise ValueError(f"a notice for {box} was refused - commit {c.get('sha', '?') if isinstance(c, dict) else '?'}: {where}") from None
    return out


def refresh(repo_dir: str) -> dict:
    """Works the notices out again for a bound repository and keeps them."""
    key = repo_key(repo_dir)
    items, alias, judge = compute(key)
    return merge(key, items, alias, judge)


_FIELDS = ("id", "repo", "box", "status", "opened_at", "updated_at", "commits", "closed_at", "closed_by", "closed_how", "closed_note")


def _row(r) -> dict:
    n = dict(zip(_FIELDS, r))
    for k in ("opened_at", "updated_at", "closed_at"):
        n[k] = _utc(n[k]) if n[k] else None
    n["name"] = n["repo"].split("/")[-1]
    n["behind"] = sum(1 for c in n["commits"] if c["state"] == "behind")
    n["progress"] = sum(1 for c in n["commits"] if c["state"] == "progress")
    return n


def notices(repo: str | None = None, closed: int = 20) -> dict:
    """The open rows - boxes behind first, then work in progress - and the
    newest closed ones. The bell counts the open rows a box is behind on."""
    where, args = ("WHERE repo = %s AND ", (repo,)) if repo else ("WHERE ", ())
    cols = ", ".join(_FIELDS)
    rows = [_row(r) for r in db().execute(f"SELECT {cols} FROM notice {where}status = 'open' ORDER BY opened_at, id", args)]
    done = [_row(r) for r in db().execute(f"SELECT {cols} FROM notice {where}status = 'closed' ORDER BY closed_at DESC, id DESC LIMIT %s",
                                          args + (closed,))]
    behind = [n for n in rows if n["behind"]]
    progress = [n for n in rows if not n["behind"]]
    return {"count": len(behind), "behind": behind, "progress": progress, "closed": done}


def close_notice(nid: int, how: str, note: str, by: str) -> dict:
    """An agent closes a row, saying what it did: done (the box reworded),
    still-right (its words still hold, and why) or ignored (the user said so)."""
    if how not in HOWS:
        raise ValueError("close it as one of: " + ", ".join(HOWS))
    if not (note or "").strip():
        raise ValueError("say what was done, or why")
    if not (by or "").strip():
        raise ValueError("say who closes it: --by NAME")
    row = db().execute("SELECT status FROM notice WHERE id = %s", (nid,)).fetchone()
    if not row:
        raise ValueError(f"no notice {nid}")
    if row[0] != "open":
        raise ValueError(f"notice {nid} is already closed")
    db().execute("UPDATE notice SET status = 'closed', closed_at = now(), updated_at = now(), closed_by = %s, closed_how = %s, closed_note = %s "
                 "WHERE id = %s", (by.strip(), how, note.strip(), nid))
    return _row(db().execute(f"SELECT {', '.join(_FIELDS)} FROM notice WHERE id = %s", (nid,)).fetchone())


# ------------------------------------------------------------- agents

def _standing() -> dict[tuple[str, str], dict]:
    """What stands: each agent's last row for each repository."""
    out: dict[tuple[str, str], dict] = {}
    for agent, repo, action, at, note in db().execute("SELECT agent, repo, action, at, note FROM agent_log ORDER BY at, id"):
        out[(agent, repo)] = {"action": action, "at": at, "note": note}
    return out


def register(agent: str, repo_dir: str, note: str = "") -> dict:
    """An agent says it answers for a bound repository (t-268908a2b1)."""
    agent = (agent or "").strip()
    if not agent:
        raise ValueError("give the agent's name: --agent NAME")
    key = repo_key(repo_dir)
    if not binding_of(key):
        raise ValueError(key + " is not bound to a canvas: automatu bind <repo> <canvas>")
    now = _standing().get((agent, key))
    if now and now["action"] == "register":
        return {"agent": agent, "repo": key, "since": _utc(now["at"]), "changed": False}
    at = db().execute("INSERT INTO agent_log (agent, repo, action, note) VALUES (%s, %s, 'register', %s) RETURNING at",
                      (agent, key, note)).fetchone()[0]
    return {"agent": agent, "repo": key, "since": _utc(at), "changed": True}


def leave(agent: str, repo_dir: str, note: str = "") -> dict:
    """An agent steps down from a repository; the log keeps that it answered for it."""
    key = repo_key(repo_dir)
    now = _standing().get((agent, key))
    if not now or now["action"] != "register":
        raise ValueError(f"{agent} does not answer for {key}")
    db().execute("INSERT INTO agent_log (agent, repo, action, note) VALUES (%s, %s, 'leave', %s)", (agent, key, note))
    return {"agent": agent, "repo": key, "changed": True}


def agents() -> list[dict]:
    """Every agent that answers for a repository now, with since when and the
    notices open on it."""
    counts: dict[str, dict] = {}
    for repo, cs in db().execute("SELECT repo, commits FROM notice WHERE status = 'open'"):
        c = counts.setdefault(repo, {"behind": 0, "progress": 0})
        if any(x["state"] == "behind" for x in cs):
            c["behind"] += 1
        elif any(x["state"] == "progress" for x in cs):
            c["progress"] += 1
    by: dict[str, list[dict]] = {}
    for (agent, repo), s in _standing().items():
        if s["action"] == "register":
            by.setdefault(agent, []).append({"repo": repo, "name": repo.split("/")[-1], "since": _utc(s["at"]), "note": s["note"],
                                             **counts.get(repo, {"behind": 0, "progress": 0})})
    return [{"agent": a, "repos": sorted(rs, key=lambda r: r["since"])} for a, rs in sorted(by.items())]
