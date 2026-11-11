"""Knowledge Desk, read for the Knowledge Desk tab (box 25, t-8551b11d21).

Knowledge Desk is a service of its own: it keeps the desks the user created,
who sits at each, the boxes each desk tracks and the canvases it has indexed,
and serves them on its A2A server to a caller with a token. AutomatU reads them
with its own token and keeps none of it. Creating, changing and removing a desk
is the user's act on AutomatU's page, passed on to Knowledge Desk
(t-d41a20184d) - as the Interrupt and a workflow's save are passed to a desk.
"""
from __future__ import annotations

import asyncio
import os

import httpx

from .desks import _token

TIMEOUT = 4.0
SLOW = 60.0   # creating a desk asks AutomatU's own MCP server for the canvases


def kd_url() -> str:
    return os.environ.get("AUTOMATU_KNOWLEDGE_DESK", "http://127.0.0.1:7796").rstrip("/")


async def overview(transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """The desks with their cards, every tracked box, and the index - or why
    Knowledge Desk could not be read."""
    token = _token()
    out = {"url": kd_url(), "up": False, "note": "", "desks": [], "tracking": [], "canvases": []}
    if not token:
        out["note"] = "no token to read Knowledge Desk - run workdesks init"
        return out
    h = {"Authorization": "Bearer " + token}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as c:
            d, t, cv = await asyncio.gather(c.get(kd_url() + "/knowledge/desks", headers=h),
                                            c.get(kd_url() + "/knowledge/tracking", headers=h),
                                            c.get(kd_url() + "/knowledge/canvases", headers=h))
    except httpx.HTTPError:
        out["note"] = "Knowledge Desk is not running: workdesks desk knowledge-desk"
        return out
    if d.status_code == 404:
        out["note"] = "this Knowledge Desk is older: restart it with the new Work Desks"
        return out
    if d.status_code == 401:
        out["note"] = "Knowledge Desk refused AutomatU's token"
        return out
    try:
        out["desks"] = d.json().get("desks") or []
        out["tracking"] = t.json().get("tracked") or [] if t.status_code == 200 else []
        out["canvases"] = cv.json().get("canvases") or [] if cv.status_code == 200 else []
    except ValueError:
        out["note"] = "Knowledge Desk answered with something AutomatU could not read"
        return out
    out["up"] = True
    return out


async def change_desk(action: str, body: dict, transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """The user's create, change or remove, passed on; Knowledge Desk checks it."""
    if action not in ("create", "change", "remove"):
        return {"done": False, "problem": "create, change or remove"}
    token = _token()
    if not token:
        return {"done": False, "problem": "no token for Knowledge Desk - run workdesks init"}
    try:
        async with httpx.AsyncClient(timeout=SLOW, transport=transport) as c:
            r = await c.post(f"{kd_url()}/knowledge/desks/{action}", json=body,
                             headers={"Authorization": "Bearer " + token})
    except httpx.HTTPError:
        return {"done": False, "problem": "Knowledge Desk is not running"}
    if r.status_code == 404:
        return {"done": False, "problem": "this Knowledge Desk is older: restart it with the new Work Desks"}
    try:
        j = r.json()
    except ValueError:
        j = {}
    if r.status_code != 200:
        return {"done": False, "problem": str(j.get("error") or f"Knowledge Desk answered {r.status_code}")}
    return {"done": bool(j.get("done")), "desk": j.get("desk"), "version": j.get("version"),
            "problem": j.get("problem")}
