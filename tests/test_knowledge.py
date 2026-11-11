"""The Knowledge Desk tab (box 25): Knowledge Desk read with AutomatU's token,
and a desk created, changed or removed passed on from AutomatU's own page.
Knowledge Desk is played by a mock transport here."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from automatu import knowledge

DESK = {"slug": "portfolio", "version": 1, "name": "Portfolio", "role": "Builds the portfolio page", "owner": "portfolio",
        "main_canvas": "Portfolio", "attached": ["Resume"], "created_at": "2026-11-12T09:00:00Z",
        "changed_at": "2026-11-12T09:00:00Z", "sitting": []}


@pytest.fixture
def kd(tmp_path, monkeypatch):
    (tmp_path / "tokens.json").write_text(json.dumps({"automatu": "tok-a"}), encoding="utf8")
    monkeypatch.setenv("AUTOMATU_WORKDESKS_TOKENS", str(tmp_path / "tokens.json"))
    monkeypatch.setenv("AUTOMATU_KNOWLEDGE_DESK", "http://kd:2")
    seen = []

    def handle(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path, req.headers.get("authorization"), req.content))
        if req.headers.get("authorization") != "Bearer tok-a":
            return httpx.Response(401)
        if req.url.path == "/knowledge/desks":
            return httpx.Response(200, json={"desks": [DESK]})
        if req.url.path == "/knowledge/tracking":
            return httpx.Response(200, json={"tracked": []})
        if req.url.path == "/knowledge/canvases":
            return httpx.Response(200, json={"canvases": [{"canvas": "Proj", "boxes": 3, "updated_at": "2026-11-12T08:00:00Z"}]})
        if req.url.path == "/knowledge/desks/create":
            b = json.loads(req.content)
            if b.get("main_canvas") == "Secret":
                return httpx.Response(200, json={"done": False, "problem": "not in AutomatU: Secret"})
            return httpx.Response(200, json={"done": True, "desk": "portfolio", "version": 1})
        return httpx.Response(404)
    return httpx.MockTransport(handle), seen


def test_the_tab_reads_the_desks_tracking_and_index_with_automatus_token(kd):
    t, seen = kd
    ov = asyncio.run(knowledge.overview(t))
    assert ov["up"] and ov["desks"][0]["name"] == "Portfolio" and ov["canvases"][0]["boxes"] == 3
    assert {a for _, _, a, _ in seen} == {"Bearer tok-a"} and all(m == "GET" for m, *_ in seen)
    from automatu.models import KdOverview
    assert KdOverview.model_validate(ov).desks[0].main_canvas == "Portfolio"


def test_a_knowledge_desk_that_is_down_or_older_is_said_so(monkeypatch, kd):
    def down(req):
        raise httpx.ConnectError("refused")
    assert "not running" in asyncio.run(knowledge.overview(httpx.MockTransport(down)))["note"]
    old = httpx.MockTransport(lambda req: httpx.Response(404))
    assert "older" in asyncio.run(knowledge.overview(old))["note"]
    assert "older" in asyncio.run(knowledge.change_desk("create", {}, old))["problem"]


def test_a_desk_is_passed_on_and_knowledge_desk_says_whether_it_took_it(kd):
    t, seen = kd
    ok = asyncio.run(knowledge.change_desk("create", {"name": "Portfolio", "role": "r", "main_canvas": "Portfolio"}, t))
    assert ok == {"done": True, "desk": "portfolio", "version": 1, "problem": None}
    no = asyncio.run(knowledge.change_desk("create", {"name": "N", "role": "r", "main_canvas": "Secret"}, t))
    assert no["done"] is False and "Secret" in no["problem"]
    assert asyncio.run(knowledge.change_desk("drop", {}, t))["done"] is False


def test_only_automatus_own_page_may_create_a_desk(store, monkeypatch):
    from fastapi.testclient import TestClient

    from automatu.serve import app

    async def passed(action, body):
        return {"done": True, "desk": "portfolio", "version": 1}
    monkeypatch.setattr(knowledge, "change_desk", passed)
    c = TestClient(app)
    body = {"name": "Portfolio", "role": "r", "main_canvas": "Portfolio"}
    assert c.post("/api/kd/desks/create", json=body, headers={"origin": "http://evil.example"}).status_code == 403
    assert c.post("/api/kd/desks/create", json=body, headers={"origin": "http://testserver"}).json()["done"] is True
