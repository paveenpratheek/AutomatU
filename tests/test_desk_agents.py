"""Agents placed in AutomatU, one at each desk (box 30, t-e02af0ac56), against a
stand-in ACP agent: the choice, the chat with its queue and asks, detaching,
and the desk's agent as an A2A agent other agents ask. Run on a store of its
own; nothing reaches the user's Knowledge Desk, Work Desks or agents."""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

PAGE = {"origin": "http://testserver"}


def desk(slug, name, canvas):
    return {"slug": slug, "name": name, "role": f"Keeps the {name} work", "main_canvas": canvas,
            "attached": ["AutomatU"], "owner": slug, "sitting": []}


DESKS = [desk("portfolio-t", "Portfolio T", "PortFolio T"), desk("notes-t", "Notes T", "Notes T"),
         desk("third-t", "Third T", "Third T")]


@pytest.fixture
def env(store, monkeypatch, tmp_path):
    from automatu import desk_agents, knowledge

    async def overview(*a, **k):
        return {"desks": DESKS}
    monkeypatch.setattr(knowledge, "overview", overview)
    monkeypatch.setenv("AUTOMATU_DESK_AGENTS", str(tmp_path / "agents"))
    monkeypatch.setenv("AUTOMATU_DESK_AGENT_CMD", json.dumps([sys.executable, str(Path(__file__).with_name("fake_acp.py"))]))
    monkeypatch.setenv("WORKDESKS_DATA", str(tmp_path / "workdesks"))
    monkeypatch.setattr(desk_agents, "_agy_models", desk_agents.AGY_MODELS)
    for d in DESKS:
        store.db().execute("DELETE FROM desk_message WHERE desk=%s", (d["slug"],))
        store.db().execute("DELETE FROM desk_agent WHERE desk=%s", (d["slug"],))
    from automatu.serve import app
    c = TestClient(app)
    work = tmp_path / "project"
    work.mkdir()
    yield c, work
    for d in DESKS:
        desk_agents.MANAGER.detach(d["slug"])


def until(c, canvas, ok, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        v = c.get("/api/desk-agents", params={"canvas": canvas}).json()
        if ok(v):
            return v
        time.sleep(0.1)
    raise AssertionError(f"never: {json.dumps(v)[:1500]}")


def choose(c, work, canvas="PortFolio T", agent="agy"):
    r = c.post("/api/desk-agents/choose", json={"canvas": canvas, "agent": agent, "model": "gemini-3.8-flash-low"
               if agent == "agy" else "claude-sonnet-5-5", "folder": str(work)}, headers=PAGE)
    assert r.status_code == 200, r.text
    return r.json()


def send(c, text, canvas="PortFolio T"):
    r = c.post("/api/desk-agents/send", json={"canvas": canvas, "text": text}, headers=PAGE)
    assert r.status_code == 200, r.text
    return r.json()


def test_with_no_agent_the_button_offers_the_choice_of_agy_or_claude_and_their_models(env):
    c, work = env
    v = c.get("/api/desk-agents", params={"canvas": "PortFolio T"}).json()
    assert v["desk"]["name"] == "Portfolio T" and v["agent"] is None
    assert [m["id"] for m in v["models"]["agy"]][0] == "gemini-3.8-flash-high"
    assert "claude-opus-5-5" in [m["id"] for m in v["models"]["claude"]]
    assert "no desk's Main canvas" in c.get("/api/desk-agents", params={"canvas": "Elsewhere"}).json()["note"]
    bad = c.post("/api/desk-agents/choose", json={"canvas": "PortFolio T", "agent": "agy", "model": "gpt-9",
                                                  "folder": str(work)}, headers=PAGE)
    assert bad.status_code == 409 and "not one of agy's models" in bad.text
    nowhere = c.post("/api/desk-agents/choose", json={"canvas": "PortFolio T", "agent": "agy", "model": "gemini-3.8-flash-low",
                                                      "folder": str(work / "missing")}, headers=PAGE)
    assert nowhere.status_code == 409 and "folder" in nowhere.text


def test_the_agent_chosen_answers_in_the_chat_with_its_steps(env):
    c, work = env
    v = choose(c, work)
    assert v["agent"]["agent"] == "agy" and v["agent"]["folder"] == str(work.resolve())
    assert "Placed Antigravity (agy) at the desk" in v["messages"][-1]["text"]
    send(c, "TOOL Read the site\nSAY The site is in place.")
    v = until(c, "PortFolio T", lambda v: any(m["kind"] == "reply" for m in v["messages"]))
    mine = next(m for m in v["messages"] if m["kind"] == "message")
    reply = next(m for m in v["messages"] if m["kind"] == "reply")
    assert mine["by"] == "You" and mine["state"] == "done"
    assert reply["text"] == "The site is in place." and reply["data"]["for"] == mine["id"]
    assert reply["data"]["steps"] == [{"title": "Read the site", "status": "done"}]


def test_work_given_while_it_runs_waits_in_the_queue_and_can_be_taken_back(env):
    c, work = env
    choose(c, work)
    send(c, "SLOW 1.5\nSAY first")
    v = until(c, "PortFolio T", lambda v: v["agent"]["state"] == "working")
    send(c, "SAY second")
    send(c, "SAY third")
    v = c.get("/api/desk-agents", params={"canvas": "PortFolio T"}).json()
    queued = [m for m in v["messages"] if m["kind"] == "message" and m["state"] == "queued"]
    assert [m["text"] for m in queued] == ["SAY second", "SAY third"]
    tb = c.post("/api/desk-agents/take-back", json={"canvas": "PortFolio T", "item": queued[1]["id"]}, headers=PAGE)
    assert tb.status_code == 200
    v = until(c, "PortFolio T", lambda v: [m["text"] for m in v["messages"] if m["kind"] == "reply"] == ["first", "second"])
    assert next(m for m in v["messages"] if m["text"] == "SAY third")["state"] == "taken back"


def test_a_permission_the_agent_asks_for_is_asked_in_the_chat_and_only_the_user_answers(env):
    c, work = env
    choose(c, work)
    send(c, "ASK Run npm run dev -- --port 8080")
    v = until(c, "PortFolio T", lambda v: any(m["kind"] == "ask" and m["state"] == "waiting" for m in v["messages"]))
    ask = next(m for m in v["messages"] if m["kind"] == "ask")
    assert ask["text"] == "Run npm run dev -- --port 8080" and v["agent"]["state"] == "waiting"
    assert c.post("/api/desk-agents/answer", json={"canvas": "PortFolio T", "ask": ask["id"], "allow": True}).status_code == 403
    assert c.post("/api/desk-agents/answer", json={"canvas": "PortFolio T", "ask": ask["id"], "allow": True}, headers=PAGE).status_code == 200
    v = until(c, "PortFolio T", lambda v: any(m["kind"] == "reply" for m in v["messages"]))
    assert next(m for m in v["messages"] if m["kind"] == "reply")["text"].startswith("allowed")
    assert next(m for m in v["messages"] if m["kind"] == "ask")["state"] == "allowed"
    send(c, "ASK Delete the site")
    v = until(c, "PortFolio T", lambda v: any(m["kind"] == "ask" and m["state"] == "waiting" for m in v["messages"]))
    ask = next(m for m in v["messages"] if m["kind"] == "ask" and m["state"] == "waiting")
    c.post("/api/desk-agents/answer", json={"canvas": "PortFolio T", "ask": ask["id"], "allow": False}, headers=PAGE)
    v = until(c, "PortFolio T", lambda v: [m["text"] for m in v["messages"] if m["kind"] == "reply"][-1:] == ["refused"])


def test_detaching_takes_the_agent_off_and_a_new_one_is_given_the_last_messages(env):
    c, work = env
    choose(c, work)
    for i in range(3):
        send(c, f"SAY reply {i}")
    until(c, "PortFolio T", lambda v: sum(m["kind"] == "reply" for m in v["messages"]) == 3)
    assert c.get("/api/desk-agents/cards").json()["agents"][0]["slug"] == "portfolio-t"
    v = c.post("/api/desk-agents/detach", json={"canvas": "PortFolio T"}, headers=PAGE).json()
    assert v["agent"] is None and "Detached the agent" in v["messages"][-1]["text"]
    assert all(a["slug"] != "portfolio-t" for a in c.get("/api/desk-agents/cards").json()["agents"])
    assert c.post("/api/desk-agents/send", json={"canvas": "PortFolio T", "text": "SAY x"}, headers=PAGE).status_code == 409
    choose(c, work, agent="claude")
    send(c, "ECHO")
    v = until(c, "PortFolio T", lambda v: sum(m["kind"] == "reply" for m in v["messages"]) == 4)
    echoed = [m for m in v["messages"] if m["kind"] == "reply"][-1]["text"]
    assert "the last 6 messages, kept by AutomatU" in echoed
    assert "[You] SAY reply 2" in echoed and "[The agent] reply 2" in echoed


def test_only_automatus_own_page_places_or_gives_work(env):
    c, work = env
    for path, body in [("choose", {"canvas": "PortFolio T", "agent": "agy", "model": "gemini-3.8-flash-low", "folder": str(work)}),
                       ("send", {"canvas": "PortFolio T", "text": "SAY hi"}), ("detach", {"canvas": "PortFolio T"})]:
        assert c.post("/api/desk-agents/" + path, json=body, headers={"origin": "http://evil.example"}).status_code == 403


def test_other_agents_reach_a_desks_agent_over_a2a_named_by_who_sent_it(env, monkeypatch):
    c, work = env
    from automatu.serve import app
    from workdesks import config, main_agent
    choose(c, work)
    asgi = httpx.ASGITransport(app=app)
    monkeypatch.setenv("WORKDESKS_AUTOMATU_URL", "http://127.0.0.1:7790")

    class Sync(httpx.BaseTransport):          # Work Desks lists AutomatU's agents with a plain client
        def handle_request(self, request):
            r = c.request(request.method, str(request.url).replace("http://127.0.0.1:7790", ""))
            return httpx.Response(r.status_code, content=r.content, headers=r.headers)
    monkeypatch.setattr(config, "HOSTED_TRANSPORT", Sync())
    monkeypatch.setattr(main_agent, "TRANSPORT", asgi)
    card = c.get("/a2a/portfolio-t/.well-known/agent-card.json").json()
    assert card["name"] == "Portfolio T" and card["supportedInterfaces"][0]["url"] == "http://127.0.0.1:7790/a2a/portfolio-t/"
    assert c.post("/a2a/portfolio-t/", json={}).status_code == 401, "a caller's token is needed"
    assert c.get("/a2a/nobody/.well-known/agent-card.json").status_code == 404

    monkeypatch.setattr(main_agent, "CALLER", "desk-agent-notes-t")
    r = asyncio.run(main_agent.ask_desk("Portfolio T", "SAY The site is on localhost:8080.", wait=20))
    assert r.state == "completed" and r.artifacts[0].text == "The site is on localhost:8080."
    v = c.get("/api/desk-agents", params={"canvas": "PortFolio T"}).json()
    asked = next(m for m in v["messages"] if m["kind"] == "message")
    assert asked["who"] == "desk-agent-notes-t" and asked["by"] == "The agent at the notes-t desk"


def test_a_chain_of_agents_asking_agents_stops_before_it_comes_back_or_runs_long(env):
    from automatu.desk_agents import MANAGER, Item
    c, work = env
    choose(c, work)
    choose(c, work, canvas="Notes T")
    assert MANAGER.chain_of("main-agent", "portfolio-t") == []
    assert MANAGER.chain_of("desk-agent-notes-t", "portfolio-t") == ["notes-t"]
    notes = MANAGER.get("notes-t")
    notes.running = Item(id=0, who="desk-agent-portfolio-t", text="", chain=["portfolio-t"])
    try:
        with pytest.raises(ValueError, match="already waiting in this chain"):
            MANAGER.chain_of("desk-agent-notes-t", "portfolio-t")
        notes.running.chain = ["third-t", "x-t"]
        with pytest.raises(ValueError, match="ask the user instead"):
            MANAGER.chain_of("desk-agent-notes-t", "portfolio-t")
    finally:
        notes.running = None


def test_agy_reads_its_own_desk_servers_tool_descriptions_without_asking(env):
    from automatu.desk_agents import MANAGER
    c, work = env
    choose(c, work)
    reads = [str(d) for d in MANAGER.get("portfolio-t").occupant.policy.read_dirs]
    mcp = Path.home() / ".gemini" / "antigravity-cli" / "mcp"
    assert str((mcp / "knowledgedesk").resolve()) in reads and str((mcp / "desks").resolve()) in reads
    assert str(mcp.resolve()) not in reads, "only the desk's own servers, not every server's"
    assert str(work.resolve()) in reads
