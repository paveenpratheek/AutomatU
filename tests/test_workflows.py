"""The desks' workflows as the user arranges them (box 20, t-d966145acd): kept
in AutomatU's store in time, only when the desk accepts them, and read back by
the desk. Work Desks is played by a mock transport; the store is the test one."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from automatu import workflows

DEFAULT = [{"step": "read_canvas"}, {"step": "read_posting"}, {"step": "gather_for_posting"}, {"step": "judge"},
           {"step": "write_analysis"}]
STEPS = {"desk": "resume-maker", "name": "Resume Maker", "steps": [], "jobs": {"analyse-for-job": {"job": "analyse-for-job",
         "steps": DEFAULT}}, "rules": ["Nothing is written or made before its citations are checked."], "max_tries": 5,
         "grants": {"writes": ["Resume"], "asks": ["knowledge-desk"], "from": "config"}, "desks": ["knowledge-desk"]}


@pytest.fixture
def desk(store, tmp_path, monkeypatch):
    (tmp_path / "tokens.json").write_text(json.dumps({"automatu": "tok-a"}), encoding="utf8")
    monkeypatch.setenv("AUTOMATU_WORKDESKS_TOKENS", str(tmp_path / "tokens.json"))
    monkeypatch.setenv("AUTOMATU_DESKS", "http://rm:1")
    store.db().execute("DELETE FROM arrangement; DELETE FROM desk_grant")
    sent = []

    def handle(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content or b"null")
        sent.append((req.method, req.url.path, body, req.headers.get("authorization")))
        if req.url.path == "/desk/steps":
            return httpx.Response(200, json=STEPS)
        if req.url.path == "/desk/check":
            if "arrangement" in body:
                bad = body["arrangement"]["steps"][0]["step"] != "read_canvas"
                return httpx.Response(200, json={"ok": not bad, "problems": ["a job starts by reading the canvas"] if bad else []})
            bad = "Ruling Test" in body["grants"]["writes"]
            return httpx.Response(200, json={"ok": not bad, "problems": ["the rules canvas"] if bad else []})
        return httpx.Response(404)
    return httpx.MockTransport(handle), sent


def test_an_arrangement_is_kept_only_when_the_desk_accepts_it_and_each_save_is_a_new_version(desk):
    t, sent = desk
    refused = asyncio.run(workflows.save("http://rm:1", "analyse-for-job", [{"step": "judge"}], transport=t))
    assert refused == {"saved": False, "problems": ["a job starts by reading the canvas"]}
    assert workflows.current("resume-maker")["jobs"] == {}, "nothing refused is kept"
    stopped = DEFAULT[:4] + [{"step": "write_analysis", "stop_before": True}]
    assert asyncio.run(workflows.save("http://rm:1", "analyse-for-job", stopped, "stop before recording", t))["version"] == 1
    assert asyncio.run(workflows.save("http://rm:1", "analyse-for-job", DEFAULT, transport=t))["version"] == 2
    now = workflows.current("resume-maker")["jobs"]["analyse-for-job"]
    assert now["version"] == 2 and now["arrangement"] == {"job": "analyse-for-job", "steps": DEFAULT}
    h = workflows.history("resume-maker")["jobs"]["analyse-for-job"]
    assert [x["version"] for x in h] == [2, 1] and h[1]["note"] == "stop before recording"
    assert {a for _, p, _, a in sent} == {"Bearer tok-a"}


def test_grants_are_kept_in_time_and_refused_ones_never(desk):
    t, _ = desk
    assert asyncio.run(workflows.save_grants("http://rm:1", ["Ruling Test"], [], t))["saved"] is False
    assert workflows.current("resume-maker")["grants"] is None
    assert asyncio.run(workflows.save_grants("http://rm:1", ["Resume", " Portfolio ", ""], ["knowledge-desk"], t)) == {
        "saved": True, "version": 1, "problems": []}
    g = workflows.current("resume-maker")["grants"]
    assert (g["version"], g["writes"], g["asks"]) == (1, ["Resume", "Portfolio"], ["knowledge-desk"])


def test_a_desk_automatu_does_not_list_is_never_called(desk):
    t, sent = desk
    with pytest.raises(workflows.DeskError, match="not one of the desks"):
        asyncio.run(workflows.of("http://elsewhere:9", t))
    assert sent == []


def test_the_api_serves_the_editor_and_the_desk_and_saves_only_from_its_own_page(desk, monkeypatch):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    t, _ = desk
    for name in ("of", "save", "save_grants"):
        real = getattr(workflows, name)
        monkeypatch.setattr(workflows, name, lambda *a, _r=real, **k: _r(*a, transport=t, **k))
    c = TestClient(app)
    j = c.get("/api/workflows", params={"desk": "http://rm:1"}).json()
    assert j["catalogue"]["desk"] == "resume-maker" and j["current"]["jobs"] == {} and j["history"]["grants"] == []
    body = {"desk": "http://rm:1", "job": "analyse-for-job", "steps": DEFAULT}
    assert c.post("/api/workflows/save", json=body).status_code == 403
    assert c.post("/api/workflows/save", json=body, headers={"origin": "http://evil.example"}).status_code == 403
    own = {"origin": "http://testserver"}
    assert c.post("/api/workflows/save", json=body, headers=own).json() == {"saved": True, "version": 1, "problems": []}
    assert c.post("/api/workflows/grants", json={"desk": "http://rm:1", "writes": ["Resume"]}).status_code == 403
    assert c.post("/api/workflows/grants", json={"desk": "http://rm:1", "writes": ["Resume"], "asks": []},
                  headers=own).json()["saved"] is True
    cur = c.get("/api/arrangements/current", params={"desk": "resume-maker"}).json()
    assert cur["jobs"]["analyse-for-job"]["version"] == 1 and cur["grants"]["writes"] == ["Resume"]
    assert c.get("/api/workflows", params={"desk": "http://nope:1"}).status_code == 409
