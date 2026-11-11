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


def test_the_users_interrupt_is_passed_on_to_a_listed_desk_with_automatus_token(setup):
    # box 23, t-5bb672b723: the one thing AutomatU sends a desk, and only to a desk it lists.
    sent = []

    def handle(req: httpx.Request) -> httpx.Response:
        sent.append((req.method, str(req.url), req.headers.get("authorization")))
        return httpx.Response(200, json={"interrupted": True})
    t = httpx.MockTransport(handle)
    assert asyncio.run(desks.interrupt("http://rm:1/", "task-1", t)) == {"interrupted": True, "why": ""}
    assert sent == [("POST", "http://rm:1/desk/runs/task-1/interrupt", "Bearer tok-a")]
    assert asyncio.run(desks.interrupt("http://elsewhere:9", "task-1", t))["interrupted"] is False
    assert asyncio.run(desks.interrupt("http://rm:1", "../x/y", t))["interrupted"] is False
    assert len(sent) == 1, "nothing is sent to a desk AutomatU does not list, nor for a made-up task"


def test_only_automatus_own_page_may_interrupt(setup, monkeypatch):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    called = []

    async def fake(desk, task):
        called.append((desk, task))
        return {"interrupted": True, "why": ""}
    monkeypatch.setattr(desks, "interrupt", fake)
    c = TestClient(app)
    body = {"desk": "http://rm:1", "task": "task-1"}
    assert c.post("/api/desks/interrupt", json=body).status_code == 403, "no page named: refused"
    assert c.post("/api/desks/interrupt", json=body, headers={"origin": "http://evil.example"}).status_code == 403
    ok = c.post("/api/desks/interrupt", json=body, headers={"origin": "http://testserver"})
    assert ok.status_code == 200 and ok.json() == {"interrupted": True, "why": ""}
    assert called == [("http://rm:1", "task-1")]


RUN = {"task_id": "t1", "desk": "resume-maker", "job": "analyse-for-job", "state": "completed",
       "started_at": "2026-11-11T10:00:00+00:00", "ended_at": "2026-11-11T10:02:00+00:00", "said": "## Analysis",
       "steps": [{"step": "gather_for_posting", "actor": "code", "status": "done", "started_at": "2026-11-11T10:00:01+00:00",
                  "ended_at": "2026-11-11T10:00:09+00:00", "tries": None, "detail": {"cited": ["h:W/tm-1/2. K"], "map": "130"}},
                 {"step": "write_analysis", "actor": "agent", "status": "done", "started_at": "2026-11-11T10:01:00+00:00",
                  "ended_at": "2026-11-11T10:02:00+00:00", "tries": None,
                  "detail": {"recorded": "Resume > Resume Maker: analyses > Analysis: X"}}],
       "asks": [{"kind": "question", "text": "Which posting?", "detail": {}, "asked_at": "2026-11-11T10:00:30+00:00",
                 "answered_at": None, "answer": None}]}


@pytest.fixture
def runs_transport():
    seen = []

    def handle(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path, req.headers.get("authorization")))
        if req.url.path == "/.well-known/agent-card.json":
            return httpx.Response(200, json=CARD)
        if req.url.path == "/desk/now":
            return httpx.Response(200, json=NOW)
        if req.url.path == "/desk/runs":
            return httpx.Response(200, json={"desk": "resume-maker", "runs": [{k: v for k, v in RUN.items() if k not in ("steps", "asks")}]})
        if req.url.path == "/desk/runs/t1":
            return httpx.Response(200, json=RUN)
        return httpx.Response(404, json={"error": "no such run"})
    return httpx.MockTransport(handle), seen


def test_a_desks_runs_lately_and_one_run_step_by_step_are_read_with_its_token(setup, monkeypatch, runs_transport):
    # box 21, t-2ddbfdabb6: the history and the bell read finished runs too; a run is read in full.
    t, seen = runs_transport
    monkeypatch.setenv("AUTOMATU_DESKS", "http://rm:1")
    rm = asyncio.run(desks.desks(t))[0]
    assert rm["recent"] == [{"task_id": "t1", "job": "analyse-for-job", "state": "completed", "said": "## Analysis",
                             "started_at": "2026-11-11T10:00:00+00:00", "ended_at": "2026-11-11T10:02:00+00:00"}]
    r = asyncio.run(desks.run("http://rm:1/", "t1", t))
    assert [s["step"] for s in r["steps"]] == ["gather_for_posting", "write_analysis"]
    assert r["steps"][0]["detail"]["cited"] == ["h:W/tm-1/2. K"] and r["steps"][1]["detail"]["recorded"].startswith("Resume >")
    assert r["asks"][0]["answer"] == "" and r["desk"] == "http://rm:1"
    assert asyncio.run(desks.run("http://rm:1", "nope", t)) is None
    assert asyncio.run(desks.run("http://elsewhere:2", "t1", t)) is None
    assert all(m == "GET" for m, _, _ in seen) and {a for _, p, a in seen if p.startswith("/desk/")} == {"Bearer tok-a"}


def test_the_api_serves_one_run_typed(setup, monkeypatch, runs_transport):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    t, _ = runs_transport
    monkeypatch.setenv("AUTOMATU_DESKS", "http://rm:1")
    real = desks.run
    monkeypatch.setattr(desks, "run", lambda d, k: real(d, k, t))
    c = TestClient(app)
    j = c.get("/api/desks/run", params={"desk": "http://rm:1", "task": "t1"}).json()
    assert j["job"] == "analyse-for-job" and j["steps"][1]["actor"] == "agent" and j["asks"][0]["kind"] == "question"
    assert c.get("/api/desks/run", params={"desk": "http://rm:1", "task": "nope"}).status_code == 404


def test_the_boxes_each_desk_tracks_are_read_from_knowledge_desk_with_automatus_token(tmp_path, monkeypatch):
    (tmp_path / "tokens.json").write_text(json.dumps({"automatu": "tok-a"}), encoding="utf8")
    monkeypatch.setenv("AUTOMATU_WORKDESKS_TOKENS", str(tmp_path / "tokens.json"))
    monkeypatch.setenv("AUTOMATU_DESKS", "http://kd:2")
    row = {"desk": "portfolio", "desk_name": "Portfolio", "hex": "h:Proj/tm-1/14. Typed data",
           "address": "Plan (totem) > 14. Typed data", "canvas": "Proj", "state": "changed", "read_at": "2026-11-12T09:00:00Z"}

    def handle(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/.well-known/agent-card.json":
            return httpx.Response(200, json={**CARD, "name": "Knowledge Desk", "skills": []})
        if req.url.path == "/knowledge/tracking":
            ok = req.headers.get("authorization") == "Bearer tok-a"
            return httpx.Response(200, json={"tracked": [row]}) if ok else httpx.Response(401)
        return httpx.Response(404)
    (kd,) = asyncio.run(desks.desks(httpx.MockTransport(handle)))
    assert kd["tracking"] == [row]
    from automatu.models import Desk
    assert Desk.model_validate(kd).tracking[0].state == "changed"
