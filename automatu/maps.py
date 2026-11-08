"""Making a map: read a bound repository and its canvas, place its regions, and
keep the result as a snapshot (map_run + placement) - so a map made today reads
the same tomorrow even if the code or the canvas has moved (t-42b6c9355c).
"""
from __future__ import annotations

import json
from pathlib import Path

from .align import Numbers, place_regions
from .binding import binding_of, plan_sections, repo_key
from .embed import MODEL
from .profile import region_vectors, section_vectors
from .sources.canvas import Canvas, read_canvas
from .sources.gitx import read_repo
from .store import db

CALIBRATION = Path(__file__).resolve().parent.parent / "calibration.json"


def calibrated() -> Numbers:
    """The calibrated numbers, or an error saying calibration has not been run
    (t-1cf7bb7eb7)."""
    try:
        c = json.loads(CALIBRATION.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise RuntimeError("no calibration.json yet: run the calibration before placing code")
    return Numbers(min_score=c["minScore"], min_margin=c["minMargin"], overlap=c.get("overlap", 0), max_shared=c.get("maxShared", 3))


def make_map(dir: str, numbers: Numbers | None = None) -> dict:
    numbers = numbers or calibrated()
    key = repo_key(dir)
    b = binding_of(key)
    if not b:
        raise RuntimeError(key + " is not bound to a canvas: automatu bind <repo> <canvas>")
    repo = read_repo(key)
    whole = read_canvas(b["canvas"])
    # Only the plan totem's boxes, when the binding names one (t-ea1ec85327).
    canvas = Canvas(name=whole.name, sections=plan_sections(b, whole.sections))
    if not canvas.sections:
        raise RuntimeError("the plan totem " + str(b["totem"]) + " has no boxes on the canvas " + b["canvas"])
    rv, made_r = region_vectors(repo, key)
    sv, made_s = section_vectors(canvas)
    places = place_regions(rv, sv, numbers)
    placed = sum(1 for p in places if p.sections)
    addresses = [s.address for s in canvas.sections]

    conn = db()
    with conn.transaction():
        run_id, made_at = conn.execute(
            "INSERT INTO map_run (repo, canvas, head, model, min_score, min_margin, overlap, regions, placed, sections) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, made_at",
            (key, b["canvas"], repo.head, MODEL, numbers.min_score, numbers.min_margin, numbers.overlap, len(places), placed, addresses)).fetchone()
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO placement (run_id, region, section, sections, near, best, score, margin) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                [(run_id, p.region, p.section, p.sections, p.near, p.best, p.score, p.margin) for p in places])
    return {"run": run_id, "made_at": made_at, "repo": key, "canvas": b["canvas"], "head": repo.head,
            "regions": len(places), "placed": placed, "sections": addresses, "places": places, "embedded": made_r + made_s}


def latest_map(dir: str) -> dict | None:
    """The newest snapshot of a repository's map, as it was made."""
    key = repo_key(dir)
    cur = db().execute("SELECT * FROM map_run WHERE repo = %s ORDER BY made_at DESC, id DESC LIMIT 1", (key,))
    row = cur.fetchone()
    if not row:
        return None
    run = dict(zip([d.name for d in cur.description], row))
    places = [dict(zip(("region", "section", "sections", "near", "best", "score", "margin"), r)) for r in db().execute(
        "SELECT region, section, sections, near, best, score, margin FROM placement WHERE run_id = %s ORDER BY region", (run["id"],))]
    return {"run": run, "places": places}


def mapped_repos() -> list[dict]:
    """Every repository with a map, with its newest run - for the map view."""
    cur = db().execute("SELECT DISTINCT ON (repo) repo, canvas, id, head, made_at, regions, placed FROM map_run ORDER BY repo, made_at DESC, id DESC")
    names = [d.name for d in cur.description]
    return [dict(zip(names, r)) for r in cur]
