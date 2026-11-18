"""The binding: metadata saying which canvas plans a repository, and no other
(t-2125e729d7), and which totem on it is the plan - code is placed only under
that totem's boxes and the rest of the canvas is extra information
(t-ea1ec85327); with no totem named, every box is a candidate (t-04f422b90e).
Set once when a project starts; changing it is a deliberate act (replace),
never a side effect of binding again (t-83634eede9).
"""
from __future__ import annotations

import re
import subprocess
from typing import Callable

from .sources.canvas import Section, read_canvas_script, sections, totem_ids
from .store import db

_FIELDS = ("repo", "canvas", "totem", "bound_at", "totem_id")


def repo_key(dir: str) -> str:
    """A repository by its top folder, written one way: forward slashes, the
    drive letter in capitals - so E:\\x and e:/x/ are one repository (t-b8f9b34f54)."""
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=dir or ".", capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        raise ValueError(str(dir) + " is not a git repository")
    return _norm(top)


def _norm(path: str) -> str:
    """A folder written one way: forward slashes, no trailing slash, the drive letter in capitals."""
    top = str(path).replace("\\", "/").rstrip("/")
    return re.sub(r"^([a-z]):", lambda m: m.group(1).upper() + ":", top)


def binding_of(dir: str) -> dict | None:
    row = db().execute("SELECT repo, canvas, totem, bound_at, totem_id FROM binding WHERE repo = %s", (repo_key(dir),)).fetchone()
    return dict(zip(_FIELDS, row)) if row else None


def bind(dir: str, canvas: str, totem: str | None = None, replace: bool = False,
         check: Callable[[str], str | None] = read_canvas_script) -> dict:
    """Binds a repository to a canvas, optionally naming its plan totem. The
    canvas must exist and the totem be on it (read through NoteX once to check).
    Binding again the same way changes nothing; naming the plan totem of a
    binding that has none is allowed; any other change needs replace."""
    repo = repo_key(dir)
    canvas = (canvas or "").strip()
    totem = (totem or "").strip() or None
    if not canvas:
        raise ValueError("give the canvas name")
    now = binding_of(repo)
    if now and now["canvas"] == canvas and now["totem"] == totem:
        return {"repo": repo, "canvas": canvas, "totem": totem, "changed": False}
    only_naming_totem = bool(now and now["canvas"] == canvas and not now["totem"] and totem)
    if now and not replace and not only_naming_totem:
        raise ValueError(repo + " is already bound to the canvas " + now["canvas"]
                         + (" (plan totem " + now["totem"] + ")" if now["totem"] else "") + "; pass replace to change it")
    script = check(canvas)
    if totem and isinstance(script, str) and not any(s.totem == totem for s in sections(script)):
        raise ValueError("the canvas " + canvas + " has no totem named " + totem + " with boxes in it")
    tid = next((i for i, n in totem_ids(script).items() if n == totem), None) if totem and isinstance(script, str) else None
    conn = db()
    with conn.transaction():
        conn.execute(
            "INSERT INTO binding (repo, canvas, totem, totem_id) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (repo) DO UPDATE SET canvas = EXCLUDED.canvas, totem = EXCLUDED.totem, totem_id = EXCLUDED.totem_id, bound_at = now()",
            (repo, canvas, totem, tid))
        # Kept, never overwritten: which totem was the plan, and from when (t-25f10ce5fd).
        conn.execute("INSERT INTO binding_log (repo, canvas, totem, totem_id) VALUES (%s, %s, %s, %s)", (repo, canvas, totem, tid))
    # The canvas a repository is bound to is in AutomatU (t-864bb59350).
    from .canvases import ensure_added
    ensure_added(canvas, "bound to " + repo.split("/")[-1])
    was = now["canvas"] + (" > " + now["totem"] if now["totem"] else "") if now else None
    return {"repo": repo, "canvas": canvas, "totem": totem, "totem_id": tid, "changed": True, "was": was}


def plan_totem(binding: dict | None, script: str | None = None) -> str | None:
    """The plan totem's name now: found by its lasting id when the canvas gives
    one, so a renamed totem stays the plan (t-9e3c69e39d); else by its name."""
    if not binding or not binding.get("totem"):
        return None
    if script and binding.get("totem_id"):
        return totem_ids(script).get(binding["totem_id"], binding["totem"])
    return binding["totem"]


def remember_totem_id(binding: dict | None, script: str) -> None:
    """A binding made before totems had lasting ids learns its totem's id the
    first time the canvas gives one."""
    if binding and binding.get("totem") and not binding.get("totem_id"):
        tid = next((i for i, n in totem_ids(script).items() if n == binding["totem"]), None)
        if tid:
            db().execute("UPDATE binding SET totem_id = %s WHERE repo = %s", (tid, binding["repo"]))
            binding["totem_id"] = tid


def plan_sections(binding: dict | None, all_sections: list[Section], script: str | None = None) -> list[Section]:
    """The sections code may be placed under: the plan totem's boxes, or every
    box when the binding names no totem."""
    name = plan_totem(binding, script)
    if name:
        return [s for s in all_sections if s.totem == name]
    return all_sections


def binding_history(repo: str) -> list[dict]:
    """Every binding the repository has had, oldest first: canvas, plan totem
    and from when. Bindings made before the log existed are rebuilt once from
    the maps - each kept the boxes it was made against - and marked as rebuilt:
    their times are the first map that shows them, so the change came at or
    before it."""
    cur = db().execute("SELECT canvas, totem, totem_id, at, rebuilt, note FROM binding_log WHERE repo = %s ORDER BY at, id", (repo,))
    rows = [dict(zip(("canvas", "totem", "totem_id", "at", "rebuilt", "note"), r)) for r in cur]
    if rows:
        return rows
    runs = db().execute("SELECT made_at, canvas, sections FROM map_run WHERE repo = %s ORDER BY made_at, id", (repo,)).fetchall()
    seen, out = None, []
    for made_at, canvas, secs in runs:
        totems = {s.split(" > ")[0].removesuffix(" (totem)") for s in (secs or [])}
        state = (canvas, totems.pop() if len(totems) == 1 else None)
        if state != seen:
            out.append({"canvas": canvas, "totem": state[1], "totem_id": None, "at": made_at, "rebuilt": True,
                        "note": "rebuilt from the first map that shows it; the change came at or before this"})
            seen = state
    now = db().execute("SELECT canvas, totem, totem_id, bound_at FROM binding WHERE repo = %s", (repo,)).fetchone()
    if now and (seen is None or (now[0], now[1]) != seen):
        out.append({"canvas": now[0], "totem": now[1], "totem_id": now[2], "at": now[3], "rebuilt": True,
                    "note": "rebuilt from the binding as it stands"})
    conn = db()
    with conn.transaction():
        for r in out:
            conn.execute("INSERT INTO binding_log (repo, canvas, totem, totem_id, at, rebuilt, note) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                         (repo, r["canvas"], r["totem"], r["totem_id"], r["at"], r["rebuilt"], r["note"]))
    return out


def repositories_near() -> list[dict]:
    """The git repositories a canvas's hex offers to link (box 31): every folder
    beside a repository AutomatU already knows that holds a .git, each saying
    whether it has a GitX record and where it is bound now. Read when asked,
    never kept; a folder that cannot be read is passed over."""
    from pathlib import Path
    now = {b["repo"]: b for b in all_bindings()}
    found: dict[str, dict] = {}
    for parent in sorted({str(Path(r).parent) for r in now}):
        try:
            kids = sorted(Path(parent).iterdir())
        except OSError:
            continue
        for d in kids:
            try:
                if not (d.is_dir() and (d / ".git").exists()):
                    continue
                gitx = (d / ".gitx").is_dir()
            except OSError:
                continue
            key = _norm(str(d))
            b = now.get(key)
            found[key] = {"repo": key, "name": d.name, "gitx": gitx,
                          "canvas": b["canvas"] if b else None, "totem": b["totem"] if b else None}
    for key, b in now.items():   # a bound repository whose folder is gone still says where it is bound
        found.setdefault(key, {"repo": key, "name": key.split("/")[-1], "gitx": False, "canvas": b["canvas"], "totem": b["totem"]})
    return sorted(found.values(), key=lambda r: r["name"].lower())


def repos_of(canvas: str) -> list[str]:
    return [r[0] for r in db().execute("SELECT repo FROM binding WHERE canvas = %s ORDER BY repo", (canvas,))]


def all_bindings() -> list[dict]:
    """Every bound repository, for the live map's watcher."""
    cur = db().execute("SELECT repo, canvas, totem, bound_at, totem_id FROM binding ORDER BY repo")
    return [dict(zip(_FIELDS, r)) for r in cur]
