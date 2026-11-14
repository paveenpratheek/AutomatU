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


async def _get(path: str, params: dict | None = None, transport=None) -> tuple[int, dict]:
    token = _token()
    if not token:
        return 0, {"error": "no token for Knowledge Desk - run workdesks init"}
    try:
        async with httpx.AsyncClient(timeout=SLOW, transport=transport) as c:
            r = await c.get(kd_url() + path, params={k: v for k, v in (params or {}).items() if v},
                            headers={"Authorization": "Bearer " + token})
    except httpx.HTTPError:
        return 0, {"error": "Knowledge Desk is not running"}
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"error": f"Knowledge Desk answered {r.status_code}"}


async def _post(path: str, body: dict, transport=None) -> tuple[int, dict]:
    token = _token()
    if not token:
        return 0, {"error": "no token for Knowledge Desk - run workdesks init"}
    try:
        async with httpx.AsyncClient(timeout=SLOW, transport=transport) as c:
            r = await c.post(kd_url() + path, json=body, headers={"Authorization": "Bearer " + token})
    except httpx.HTTPError:
        return 0, {"error": "Knowledge Desk is not running"}
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"error": f"Knowledge Desk answered {r.status_code}"}


def _older(code: int) -> str | None:
    return "this Knowledge Desk is older: restart it with the new Work Desks" if code == 404 else None


async def ask(question: str, only: str | None = "built", transport=None) -> dict:
    """The user's question on the Ask section, put to Knowledge Desk as any
    desk puts one: an A2A SendMessage with AutomatU's token. What comes back is
    its answer as it gave it - sentences quoted from the canvases, each with
    its hex - and AutomatU keeps none of it."""
    question = (question or "").strip()
    if not question:
        return {"error": "ask a question"}
    token = _token()
    if not token:
        return {"error": "no token for Knowledge Desk - run workdesks init"}
    data = {"question": question[:2000]}
    if only == "built":
        data["only"] = "built"
    body = {"jsonrpc": "2.0", "id": 1, "method": "SendMessage",
            "params": {"message": {"messageId": os.urandom(8).hex(), "role": "ROLE_USER", "parts": [{"data": data}]}}}
    try:
        async with httpx.AsyncClient(timeout=SLOW, transport=transport) as c:
            r = await c.post(kd_url() + "/", json=body,
                             headers={"Authorization": "Bearer " + token, "A2A-Version": "1.0"})
    except httpx.HTTPError:
        return {"error": "Knowledge Desk is not running: workdesks desk knowledge-desk"}
    if r.status_code == 401:
        return {"error": "Knowledge Desk refused AutomatU's token"}
    try:
        j = r.json()
    except ValueError:
        return {"error": f"Knowledge Desk answered {r.status_code}"}
    if j.get("error"):
        return {"error": str(j["error"].get("message") or j["error"])}
    res = j.get("result") or {}
    task = res.get("task") or {}
    if task and (task.get("status") or {}).get("state") not in (None, "TASK_STATE_COMPLETED"):
        said = " ".join(p.get("text", "") for p in ((task.get("status") or {}).get("message") or {}).get("parts") or [])
        return {"error": said.strip() or "Knowledge Desk could not answer"}
    parts = [p for a in task.get("artifacts") or [] for p in a.get("parts") or []] or (res.get("message") or {}).get("parts") or []
    answer = next((p["data"] for p in parts if isinstance(p.get("data"), dict)), None)
    if answer is None:
        return {"error": "Knowledge Desk answered with something AutomatU could not read"}
    return {"question": question, "only": "built" if only == "built" else None,
            "sentences": answer.get("sentences") or [], "passages": answer.get("passages") or []}


async def flows(desk: str, transport=None) -> dict:
    """A created desk's flows, the steps they are made from, the rules, and its runs (K5)."""
    code, j = await _get("/knowledge/flows", {"desk": desk}, transport)
    if code != 200:
        return {"error": _older(code) or j.get("error") or j.get("detail") or f"Knowledge Desk answered {code}"}
    return j


async def save_flow(body: dict, transport=None) -> dict:
    """The user's flow, passed on; Knowledge Desk checks it against the rules and keeps it in versions."""
    code, j = await _post("/knowledge/flows/save", body, transport)
    if code != 200:
        return {"saved": False, "problems": [_older(code) or j.get("error") or f"Knowledge Desk answered {code}"]}
    return {"saved": bool(j.get("saved")), "version": j.get("version"), "problems": j.get("problems") or [],
            "note": j.get("note")}


async def answer_run(run: str, yes: bool, transport=None) -> dict:
    """The user's yes or no at a flow's stop, passed on."""
    if not run or "/" in run:
        return {"done": False, "problem": "no such run"}
    code, j = await _post(f"/knowledge/runs/{run}/answer", {"yes": bool(yes)}, transport)
    if code != 200:
        return {"done": False, "problem": _older(code) or j.get("error") or f"Knowledge Desk answered {code}"}
    return {"done": bool(j.get("done")), "state": j.get("state"), "problem": j.get("problem")}


async def monitoring(desk: str | None = None, transport=None) -> dict:
    """Each agent's traced calls while it sat at a desk, and the A2A tasks between desks (K6)."""
    (tc, t), (ac, a) = await asyncio.gather(_get("/knowledge/traces", {"desk": desk}, transport),
                                            _get("/knowledge/a2a", None, transport))
    if tc != 200:
        return {"up": False, "note": _older(tc) or t.get("error") or f"Knowledge Desk answered {tc}",
                "sessions": [], "calls": [], "tasks": []}
    return {"up": True, "note": t.get("note", ""), "sessions": t.get("sessions") or [], "calls": t.get("calls") or [],
            "tasks": (a.get("tasks") or []) if ac == 200 else []}


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
