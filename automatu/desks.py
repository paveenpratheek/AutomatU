"""The agents the user has given jobs, as their Agent Cards (box 22, t-2b6d9b3541).

Each Work Desks desk is an A2A agent: its card is open at
/.well-known/agent-card.json, and what it is doing now - its runs, the step
each is on, the agent and model at it, and every permission ask and question
waiting on the user - is served read-only at /desk/now to a caller with a
token. AutomatU reads both, with the token Work Desks made for it, and
writes nothing anywhere: answering stays in the user's chat (t-ae4cb0d0a9).
The one thing it sends a desk is the user's own interrupt (box 23).
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import httpx

DEFAULT_DESKS = "http://127.0.0.1:7795,http://127.0.0.1:7796"   # Resume Maker, Knowledge Desk
TIMEOUT = 3.0


def desk_urls() -> list[str]:
    return [u.strip().rstrip("/") for u in os.environ.get("AUTOMATU_DESKS", DEFAULT_DESKS).split(",") if u.strip()]


def _token() -> str | None:
    """AutomatU's own token for reading the desks, made by workdesks init."""
    f = Path(os.environ.get("AUTOMATU_WORKDESKS_TOKENS", r"E:\ter-manager\plugins\work-desks\secrets\tokens.json"))
    try:
        return json.loads(f.read_text(encoding="utf8")).get("automatu")
    except (OSError, ValueError):
        return None


def _card(c: dict) -> dict:
    return {"name": c.get("name", ""), "description": c.get("description", ""), "version": c.get("version", ""),
            "skills": [{"id": s.get("id", ""), "name": s.get("name", ""), "description": s.get("description", ""),
                        "examples": list(s.get("examples") or [])} for s in c.get("skills") or []]}


def _live(n: dict) -> dict:
    runs = []
    for r in n.get("runs") or []:
        st = r.get("step") or None
        runs.append({"task_id": r.get("task_id", ""), "job": r.get("job", ""), "state": r.get("state", ""),
                     "work": r.get("work"), "started_at": str(r.get("started_at") or ""),
                     "step": {"step": st.get("step", ""), "actor": st.get("actor", ""), "status": st.get("status", ""),
                              "started_at": str(st.get("started_at") or "")} if st else None})
    waiting = [{"task_id": a.get("task_id", ""), "kind": a.get("kind", ""), "text": a.get("text", ""),
                "job": a.get("job"), "asked_at": str(a.get("asked_at") or "")} for a in n.get("waiting") or []]
    return {"agent": n.get("agent"), "model": n.get("model"), "runs": runs, "waiting": waiting}


async def _one(h: httpx.AsyncClient, url: str, token: str | None) -> dict:
    out = {"url": url, "up": False, "card": None, "live": None, "note": ""}
    try:
        r = await h.get(url + "/.well-known/agent-card.json")
        r.raise_for_status()
        out["card"], out["up"] = _card(r.json()), True
    except (httpx.HTTPError, ValueError):
        out["note"] = "not running"
        return out
    if not token:
        out["note"] = "no token to read what it is doing - run workdesks init"
        return out
    try:
        r = await h.get(url + "/desk/now", headers={"Authorization": "Bearer " + token})
        if r.status_code == 404:
            out["note"] = "keeps no record of its runs"
        elif r.status_code == 401:
            out["note"] = "refused AutomatU's token"
        else:
            r.raise_for_status()
            out["live"] = _live(r.json())
    except (httpx.HTTPError, ValueError):
        out["note"] = "could not say what it is doing"
    return out


async def desks(transport: httpx.AsyncBaseTransport | None = None) -> list[dict]:
    """Every desk, its card and what it is doing now; a desk that is not
    running is listed as such, never left out."""
    token = _token()
    async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as h:
        return list(await asyncio.gather(*(_one(h, u, token) for u in desk_urls())))


async def interrupt(url: str, task: str, transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """The user's own interrupt, passed on to the desk running the task - the
    one thing AutomatU sends a desk (box 23, t-5bb672b723). AutomatU never
    decides an interrupt, and never starts, answers or cancels a job itself."""
    url = (url or "").strip().rstrip("/")
    if url not in desk_urls():
        return {"interrupted": False, "why": "not one of the desks AutomatU knows"}
    if not task or "/" in task:
        return {"interrupted": False, "why": "no such task"}
    token = _token()
    if not token:
        return {"interrupted": False, "why": "no token for the desks - run workdesks init"}
    try:
        async with httpx.AsyncClient(timeout=10, transport=transport) as h:
            r = await h.post(f"{url}/desk/runs/{task}/interrupt", headers={"Authorization": "Bearer " + token})
    except httpx.HTTPError:
        return {"interrupted": False, "why": "the desk is not running"}
    if r.status_code == 404:
        return {"interrupted": False, "why": "this desk cannot be interrupted yet - restart it with the new Work Desks"}
    try:
        body = r.json()
    except ValueError:
        body = {}
    return {"interrupted": bool(body.get("interrupted")), "why": str(body.get("why") or body.get("error") or "")}
