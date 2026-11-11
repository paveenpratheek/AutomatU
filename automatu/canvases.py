"""The canvases the user added (box 24, t-4fb5a8ff46): only the canvases the
user picks from CanvasX, through NoteX, are in AutomatU - drawn on the Main map,
searched, and served to agents and to Knowledge Desk, bound to a repository or
not (t-4d45a8a855 in the plan). The list is AutomatU's own, kept in its store
with every add and removal in time; nothing is written on a canvas.

Binding a repository adds its canvas, and a canvas a repository is bound to
stays while the binding does - code is aligned under its plan (t-864bb59350).
"""
from __future__ import annotations

from typing import Callable

from .store import db


def _notex_fabrics() -> list[dict]:
    from .sources.canvas import _notex_get
    return _notex_get("/api/fabrics").get("fabrics") or []


def added() -> list[str]:
    """The canvases in AutomatU, by name."""
    return [r[0] for r in db().execute("SELECT canvas FROM added_canvas ORDER BY canvas")]


def is_added(canvas: str) -> bool:
    return db().execute("SELECT 1 FROM added_canvas WHERE canvas = %s", (canvas,)).fetchone() is not None


def _bound_to(canvas: str) -> list[str]:
    return [r[0] for r in db().execute("SELECT repo FROM binding WHERE canvas = %s ORDER BY repo", (canvas,))]


def listing(fabrics: Callable[[], list[dict]] | None = None) -> dict:
    """Every canvas NoteX has, each saying whether it is in AutomatU, which
    repositories are bound to it, and whether it is the rules canvas - the
    one canvas that is never added. A canvas added here that NoteX no longer
    has is listed as missing, so the user can take it out."""
    have = {r[0]: r[1] for r in db().execute("SELECT canvas, added_at FROM added_canvas")}
    out, seen = [], set()
    for f in (fabrics or _notex_fabrics)():
        name = f.get("name")
        if not name:
            continue
        seen.add(name)
        out.append({"name": name, "added": name in have, "added_at": have.get(name), "rules": bool(f.get("rules")),
                    "agent": bool(f.get("agent")), "repos": _bound_to(name), "missing": False})
    for name, at in sorted(have.items()):
        if name not in seen:
            out.append({"name": name, "added": True, "added_at": at, "rules": False, "agent": False,
                        "repos": _bound_to(name), "missing": True})
    return {"canvases": out}


def add(canvas: str, fabrics: Callable[[], list[dict]] | None = None, note: str = "") -> dict:
    """Adds a canvas NoteX has. Adding one already there changes nothing; the
    rules canvas is refused - it holds only the user's own words."""
    canvas = (canvas or "").strip()
    if not canvas:
        raise ValueError("name a canvas")
    if is_added(canvas):
        return {"canvas": canvas, "changed": False}
    f = next((x for x in (fabrics or _notex_fabrics)() if x.get("name") == canvas), None)
    if f is None:
        raise ValueError(f"NoteX has no canvas called {canvas!r}")
    if f.get("rules"):
        raise ValueError(f"{canvas} is the rules canvas: it holds only your own words and is never added")
    _set(canvas, True, note)
    return {"canvas": canvas, "changed": True}


def remove(canvas: str) -> dict:
    """Takes a canvas out of AutomatU: off the map, out of search, and out of
    Knowledge Desk's index the next time it looks. A canvas a repository is
    bound to is refused while the binding stands."""
    canvas = (canvas or "").strip()
    if not is_added(canvas):
        return {"canvas": canvas, "changed": False}
    repos = _bound_to(canvas)
    if repos:
        raise ValueError(f"{canvas} plans " + ", ".join(r.split("/")[-1] for r in repos)
                         + ": its code is aligned under it, so it stays while that binding does")
    _set(canvas, False, "")
    return {"canvas": canvas, "changed": True}


def ensure_added(canvas: str, note: str) -> None:
    """For binding: the canvas a repository is bound to is in AutomatU."""
    if not is_added(canvas):
        _set(canvas, True, note)


def _set(canvas: str, on: bool, note: str) -> None:
    conn = db()
    with conn.transaction():
        if on:
            conn.execute("INSERT INTO added_canvas (canvas) VALUES (%s) ON CONFLICT DO NOTHING", (canvas,))
        else:
            conn.execute("DELETE FROM added_canvas WHERE canvas = %s", (canvas,))
        conn.execute("INSERT INTO added_canvas_log (canvas, added, note) VALUES (%s, %s, %s)", (canvas, on, note))


def history() -> list[dict]:
    """Every add and removal, oldest first."""
    cur = db().execute("SELECT canvas, added, at, note FROM added_canvas_log ORDER BY at, id")
    return [dict(zip(("canvas", "added", "at", "note"), r)) for r in cur]
