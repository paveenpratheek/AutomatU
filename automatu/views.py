"""What the map view's page reads, put together from the sources when asked
(t-87c7947c95) - nothing here is stored.

canvases_view: every canvas bound to a repository, as a tree of totems,
sub-totems, boxes and their notes, read live from NoteX.

code_view: a repository's newest map, with what the traffic search reads for
each region - its plan box's words, and the messages and decisions of the
commits whose lines are in it - read live from GitX. A repository's GitX read
is kept in memory for the HEAD it was made at, so asking again before the next
commit does not run git blame again (t-8958a38540).
"""
from __future__ import annotations

import threading
from urllib.parse import quote

from .binding import all_bindings, plan_sections
from .maps import head_of, latest_map
from .profile import live_thoughts
from .sources.canvas import canvas_files, read_canvas_raw, sections, tree
from .sources.gitx import Repo, read_repo

_repos: dict[str, tuple[str, Repo]] = {}
_lock = threading.Lock()


def _repo(key: str) -> Repo:
    head = head_of(key)
    with _lock:
        hit = _repos.get(key)
        if hit and hit[0] == head:
            return hit[1]
    repo = read_repo(key)
    with _lock:
        _repos[key] = (head, repo)
    return repo


def canvases_view() -> dict:
    by_canvas: dict[str, list[dict]] = {}
    for b in all_bindings():
        by_canvas.setdefault(b["canvas"], []).append({"repo": b["repo"], "name": b["repo"].split("/")[-1], "totem": b["totem"]})
    out = []
    for name, repos in sorted(by_canvas.items()):
        try:
            raw = read_canvas_raw(name)
        except RuntimeError as e:
            out.append({"name": name, "agent": False, "totems": [], "repos": repos, "error": str(e)})
            continue
        totems = tree(raw["script"])
        _with_pictures(name, totems)
        out.append({"name": name, "agent": raw["agent"], "totems": totems, "repos": repos})
    return {"canvases": out}


def _with_pictures(canvas: str, totems: list[dict]) -> None:
    """Each image on the canvas gets the address the page shows it from and its
    proportions, so the board is laid out before any picture arrives."""
    try:
        files = canvas_files(canvas)
    except (OSError, ValueError, RuntimeError):
        return

    def walk(node: dict) -> None:
        for it in node.get("items", []):
            f = files.get(it.get("id", "")) if it.get("image") else None
            if f and f["image"]:
                it["src"] = "/api/canvas-image?canvas=" + quote(canvas, safe="") + "&id=" + quote(it["id"], safe="")
                if f["w"] and f["h"]:
                    it["ratio"] = f"{f['w']:g} / {f['h']:g}"
        for k in node.get("boxes", []) + node.get("subs", []):
            walk(k)

    for t in totems:
        walk(t)


def code_view(repo_key: str) -> dict | None:
    m = latest_map(repo_key)
    if not m:
        return None
    b = next((x for x in all_bindings() if x["repo"] == m["run"]["repo"]), None)
    words = {}
    if b:
        try:
            words = {s.address: s.words for s in plan_sections(b, sections(read_canvas_raw(b["canvas"])["script"]))}
        except RuntimeError:
            words = {}
    repo = _repo(m["run"]["repo"])
    live = live_thoughts(repo.thoughts)
    regions, commits, thoughts = {}, {}, {}
    for r in repo.regions:
        regions[r.id] = {"file": r.file, "name": r.name, "lines": [r.start, r.end],
                         "commits": [sha for sha, _ in r.commits], "thoughts": [t for t in r.thoughts if t in live]}
        for sha, _ in r.commits:
            if sha in repo.commits:
                commits[sha] = [repo.commits[sha].date, repo.commits[sha].text]
        for t in regions[r.id]["thoughts"]:
            thoughts[t] = live[t].text
    return {**m, "words": {a: words.get(a, "") for a in m["run"]["sections"]},
            "regions": regions, "commits": commits, "thoughts": thoughts}
