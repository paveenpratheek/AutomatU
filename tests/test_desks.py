"""The desks as their Agent Cards (box 22, t-2b6d9b3541): read from Work Desks
with AutomatU's own token, read-only; a desk that is not running is listed as
such. Work Desks is played by a mock transport here."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from automatu import desks

CARD = {"name": "Resume Maker", "description": "Keeps the user's resume", "version": "1.0",
        "skills": [{"id": "analyse-for-job", "name": "Analyse for a job", "description": "matches and gaps",
                    "examples": ["Analyse my resume for this posting."], "tags": ["jobs"]}]}
NOW = {"desk": "resume-maker", "agent": "claude", "model": "claude-sonnet-5-5",
       "runs": [{"task_id": "t1", "job": "remove-analysis", "state": "waiting", "work": "c1", "started_at": "2026-11-11T10:00:00+00:00",
                 "step": {"step": "remove_analysis", "actor": "code", "status": "waiting", "started_at": "2026-11-11T10:00:01+00:00"}}],
       "waiting": [{"task_id": "t1", "kind": "question", "text": 'Remove "Analysis: Google gen-AI Role"? Answer yes or no.',
                    "job": "remove-analysis", "asked_at": "2026-11-11T10:00:02+00:00", "detail": {}}]}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    (tmp_path / "tokens.json").write_text(json.dumps({"automatu": "tok-a", "main-agent": "tok-m"}), encoding="utf8")
    monkeypatch.setenv("AUTOMATU_WORKDESKS_TOKENS", str(tmp_path / "tokens.json"))
    monkeypatch.setenv("AUTOMATU_DESKS", "http://rm:1, http://kd:2/, http://down:3")
    seen = []

    def handle(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, str(req.url), req.headers.get("authorization")))
        if req.url.host == "down":
            raise httpx.ConnectError("refused")
        if req.url.path == "/.well-known/agent-card.json":
            return httpx.Response(200, json=CARD if req.url.host == "rm" else {**CARD, "name": "Knowledge Desk", "skills": []})
        if req.url.path == "/desk/now":
            if req.headers.get("authorization") != "Bearer tok-a":
                return httpx.Response(401)
            return httpx.Response(200, json=NOW) if req.url.host == "rm" else httpx.Response(404)
        return httpx.Response(404)
    return httpx.MockTransport(handle), seen


def test_each_desk_is_its_card_with_what_it_does_and_what_waits_on_the_user(setup):
    transport, seen = setup
    rm, kd, down = asyncio.run(desks.desks(transport))
    assert rm["up"] and rm["card"]["name"] == "Resume Maker" and rm["card"]["skills"][0]["examples"]
    assert (rm["live"]["agent"], rm["live"]["model"]) == ("claude", "claude-sonnet-5-5")
    assert rm["live"]["runs"][0]["step"] == {"step": "remove_analysis", "actor": "code", "status": "waiting",
                                             "started_at": "2026-11-11T10:00:01+00:00"}
    assert rm["live"]["waiting"][0]["text"].startswith('Remove "Analysis: Google')
    assert kd["up"] and kd["live"] is None and kd["note"] == "keeps no record of its runs"
    assert not down["up"] and down["note"] == "not running"
    assert all(m == "GET" for m, _, _ in seen), "AutomatU only reads"
    assert {a for _, u, a in seen if u.endswith("/desk/now")} == {"Bearer tok-a"}, "with its own token, never another's"
    assert all(a is None for _, u, a in seen if "agent-card" in u), "the card is open; no token is sent for it"


def test_without_its_token_it_says_how_to_get_one(setup, monkeypatch, tmp_path):
    transport, _ = setup
    monkeypatch.setenv("AUTOMATU_WORKDESKS_TOKENS", str(tmp_path / "missing.json"))
    rm = asyncio.run(desks.desks(transport))[0]
    assert rm["up"] and rm["live"] is None and "workdesks init" in rm["note"]


def test_the_api_serves_them_typed(setup, monkeypatch):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    transport, _ = setup
    real = desks.desks
    monkeypatch.setattr(desks, "desks", lambda: real(transport))
    j = TestClient(app).get("/api/desks").json()
    assert [d["card"]["name"] if d["card"] else None for d in j["desks"]] == ["Resume Maker", "Knowledge Desk", None]
    assert j["desks"][0]["live"]["waiting"][0]["job"] == "remove-analysis"
