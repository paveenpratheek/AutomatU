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

from .sources.canvas import Section, read_canvas_script, sections
from .store import db


def repo_key(dir: str) -> str:
    """A repository by its top folder, written one way: forward slashes, the
    drive letter in capitals - so E:\\x and e:/x/ are one repository (t-b8f9b34f54)."""
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=dir or ".", capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        raise ValueError(str(dir) + " is not a git repository")
    top = top.replace("\\", "/").rstrip("/")
    return re.sub(r"^([a-z]):", lambda m: m.group(1).upper() + ":", top)


def binding_of(dir: str) -> dict | None:
    row = db().execute("SELECT repo, canvas, totem, bound_at FROM binding WHERE repo = %s", (repo_key(dir),)).fetchone()
    return dict(zip(("repo", "canvas", "totem", "bound_at"), row)) if row else None


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
    db().execute(
        "INSERT INTO binding (repo, canvas, totem) VALUES (%s, %s, %s) "
        "ON CONFLICT (repo) DO UPDATE SET canvas = EXCLUDED.canvas, totem = EXCLUDED.totem, bound_at = now()",
        (repo, canvas, totem))
    was = now["canvas"] + (" > " + now["totem"] if now["totem"] else "") if now else None
    return {"repo": repo, "canvas": canvas, "totem": totem, "changed": True, "was": was}


def plan_sections(binding: dict | None, all_sections: list[Section]) -> list[Section]:
    """The sections code may be placed under: the plan totem's boxes, or every
    box when the binding names no totem."""
    if binding and binding.get("totem"):
        return [s for s in all_sections if s.totem == binding["totem"]]
    return all_sections


def repos_of(canvas: str) -> list[str]:
    return [r[0] for r in db().execute("SELECT repo FROM binding WHERE canvas = %s ORDER BY repo", (canvas,))]


def all_bindings() -> list[dict]:
    """Every bound repository, for the live map's watcher."""
    cur = db().execute("SELECT repo, canvas, totem, bound_at FROM binding ORDER BY repo")
    return [dict(zip(("repo", "canvas", "totem", "bound_at"), r)) for r in cur]
