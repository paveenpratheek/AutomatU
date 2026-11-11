"""The desks' workflows as the user arranges them (box 20, t-d966145acd).

A Work Desks desk offers its steps, its jobs as it runs them by default and
the rules no arrangement may break (/desk/steps). The user arranges a job's
flow - its steps in order, where each sends its problems back and how many
times, where the run stops for the user's yes - and the desk's grants: the
canvases its agent may write and the desks it may ask (t-7d4389282b).

AutomatU keeps every arrangement and every grant in its own store, in time -
each save a new version - and never on a canvas (t-0ad73f14d1). Before a save
the desk checks it (/desk/check): what it refuses is not kept, and the user is
told why. The desk reads the newest at the start of each run, through
/api/arrangements/current; AutomatU never runs a job itself.
"""
from __future__ import annotations

import json

import httpx

from .desks import TIMEOUT, _token, desk_urls
from .store import db


class DeskError(ValueError):
    pass


async def _desk(url: str, method: str, path: str, body: dict | None = None,
                transport: httpx.AsyncBaseTransport | None = None) -> dict:
    url = (url or "").strip().rstrip("/")
    if url not in desk_urls():
        raise DeskError("not one of the desks AutomatU knows")
    token = _token()
    if not token:
        raise DeskError("no token for the desks - run workdesks init")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT * 3, transport=transport) as h:
            r = await h.request(method, url + path, json=body, headers={"Authorization": "Bearer " + token})
    except httpx.HTTPError:
        raise DeskError("the desk is not running")
    if r.status_code == 404:
        raise DeskError("this desk has no jobs to arrange - or it runs Work Desks from before arranging; restart it")
    if r.status_code != 200:
        raise DeskError(f"the desk answered {r.status_code}")
    return r.json()


def current(desk: str) -> dict:
    """The newest arrangement of each of a desk's jobs, and its newest grants."""
    jobs = {}
    for job, version, steps, saved_at, note in db().execute(
            "SELECT DISTINCT ON (job) job, version, steps, saved_at, note FROM arrangement WHERE desk = %s "
            "ORDER BY job, version DESC", (desk,)):
        jobs[job] = {"version": version, "saved_at": saved_at.isoformat(), "note": note,
                     "arrangement": {"job": job, "steps": steps}}
    g = db().execute("SELECT version, writes, asks, saved_at FROM desk_grant WHERE desk = %s ORDER BY version DESC "
                     "LIMIT 1", (desk,)).fetchone()
    grants = {"version": g[0], "writes": g[1], "asks": g[2], "saved_at": g[3].isoformat()} if g else None
    return {"desk": desk, "jobs": jobs, "grants": grants}


def history(desk: str) -> dict:
    """Every version of each job's arrangement and of the grants, newest first."""
    jobs: dict[str, list] = {}
    for job, version, steps, saved_at, note in db().execute(
            "SELECT job, version, steps, saved_at, note FROM arrangement WHERE desk = %s ORDER BY job, version DESC",
            (desk,)):
        jobs.setdefault(job, []).append({"version": version, "steps": steps, "saved_at": saved_at.isoformat(),
                                         "note": note})
    grants = [{"version": v, "writes": w, "asks": a, "saved_at": t.isoformat()} for v, w, a, t in db().execute(
        "SELECT version, writes, asks, saved_at FROM desk_grant WHERE desk = %s ORDER BY version DESC", (desk,))]
    return {"jobs": jobs, "grants": grants}


async def of(url: str, transport=None) -> dict:
    """What the editor needs for a desk: its steps, default jobs, rules and
    grants as it holds them; what the user arranged for it; and its history."""
    cat = await _desk(url, "GET", "/desk/steps", transport=transport)
    slug = cat["desk"]
    return {"url": url.strip().rstrip("/"), "catalogue": cat, "current": current(slug), "history": history(slug)}


async def save(url: str, job: str, steps: list[dict], note: str = "", transport=None) -> dict:
    """A new version of a job's arrangement, kept only when the desk can run it."""
    arr = {"job": job, "steps": steps}
    r = await _desk(url, "POST", "/desk/check", {"arrangement": arr}, transport=transport)
    if not r.get("ok"):
        return {"saved": False, "problems": r.get("problems") or ["the desk refused it"]}
    slug = (await _desk(url, "GET", "/desk/steps", transport=transport))["desk"]
    conn = db()
    with conn.transaction():
        v = conn.execute("SELECT coalesce(max(version), 0) + 1 FROM arrangement WHERE desk = %s AND job = %s",
                         (slug, job)).fetchone()[0]
        conn.execute("INSERT INTO arrangement (desk, job, version, steps, note) VALUES (%s, %s, %s, %s, %s)",
                     (slug, job, v, json.dumps(steps), note[:300]))
    return {"saved": True, "version": v, "problems": []}


async def save_grants(url: str, writes: list[str], asks: list[str], transport=None) -> dict:
    """A new version of a desk's grants, kept only when the desk accepts them."""
    g = {"writes": [w.strip() for w in writes if w.strip()], "asks": list(asks)}
    r = await _desk(url, "POST", "/desk/check", {"grants": g}, transport=transport)
    if not r.get("ok"):
        return {"saved": False, "problems": r.get("problems") or ["the desk refused them"]}
    slug = (await _desk(url, "GET", "/desk/steps", transport=transport))["desk"]
    conn = db()
    with conn.transaction():
        v = conn.execute("SELECT coalesce(max(version), 0) + 1 FROM desk_grant WHERE desk = %s", (slug,)).fetchone()[0]
        conn.execute("INSERT INTO desk_grant (desk, version, writes, asks) VALUES (%s, %s, %s, %s)",
                     (slug, v, json.dumps(g["writes"]), json.dumps(g["asks"])))
    return {"saved": True, "version": v, "problems": []}
