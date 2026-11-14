"""Box 30: talking to the agent from its hex. The apps' stores are played by
folders made here and the agent by a stand-in (fake_acp.py) - no real
conversation is read or copied and no model is asked anything."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

import pytest

from automatu import talk

REPO = "E:/Coding CLI/Project WorkDesk"
OTHER = "E:/Coding CLI/Project NoteX"


def _claude_conv(home: Path, folder: str, cid: str, cwd: str, entry: str, title: str, said: str = "") -> Path:
    d = home / "projects" / folder
    d.mkdir(parents=True, exist_ok=True)
    rows = [{"type": "user", "cwd": cwd, "entrypoint": entry, "sessionId": cid, "message": {"content": said or "hello"}},
            {"type": "ai-title", "aiTitle": "the app's title", "sessionId": cid},
            {"type": "custom-title", "customTitle": title, "sessionId": cid}]
    p = d / f"{cid}.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf8")
    return p


def _agy_app(home: Path, rows: list[tuple]) -> None:
    app = home / "antigravity"
    (app / "conversations").mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(app / "conversation_summaries.db") as c:
        c.execute("CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, preview TEXT, step_count INT, "
                  "last_modified_time TEXT, workspace_uris TEXT, status TEXT, source TEXT)")
        for cid, title, at, uris, source in rows:
            c.execute("INSERT INTO conversation_summaries VALUES (?,?,?,?,?,?,?,?)", (cid, title, "", 3, at, json.dumps(uris), "", source))
            with sqlite3.connect(app / "conversations" / f"{cid}.db") as cv:
                cv.execute("CREATE TABLE trajectory_meta (trajectory_id TEXT, cascade_id TEXT)")
                cv.execute("INSERT INTO trajectory_meta VALUES ('t', ?)", (cid,))


@pytest.fixture
def stores(tmp_path, monkeypatch):
    claude, gemini = tmp_path / "claude", tmp_path / "gemini"
    monkeypatch.setenv("AUTOMATU_CLAUDE_HOME", str(claude))
    monkeypatch.setenv("AUTOMATU_GEMINI_HOME", str(gemini))
    talk._claude_seen.clear()
    now = time.time()
    a = _claude_conv(claude, "E--Coding-CLI-Project-WorkDesk", "c-in-folder", REPO.replace("/", "\\"), "cli", "Work in the folder")
    b = _claude_conv(claude, "E--Coding-CLI-project-ter-manager", "c-worked-in", "E:\\Coding CLI\\project ter-manager",
                     "claude-desktop", "Opened elsewhere, worked here", said='edited E:\\Coding CLI\\Project WorkDesk\\x.py')
    _claude_conv(claude, "E--Coding-CLI-Project-WorkDesk", "c-desk", REPO, "sdk-ts", "A desk's own session")
    _claude_conv(claude, "E--Coding-CLI-Project-NoteX", "c-other", OTHER, "cli", "Another project")
    os.utime(a, (now - 3600, now - 3600))
    os.utime(b, (now - 60, now - 60))
    _agy_app(gemini, [("g-app", "In the app", "2026-11-13 10:00:00+00:00", ["file:///e%3A/Coding%20CLI/Project%20WorkDesk"], ""),
                      ("g-cli", "A desk session", "2026-11-14 10:00:00+00:00", ["file:///E:/Coding CLI/Project WorkDesk"], "CORTEX_TRAJECTORY_SOURCE_CLI"),
                      ("g-else", "Elsewhere", "2026-11-14 11:00:00+00:00", ["file:///e%3A/antigravity%20V1"], "")])
    return claude, gemini


def test_the_agents_conversations_on_a_project_come_from_where_the_apps_keep_them(stores):
    cs = talk.conversations(REPO, (REPO, OTHER))
    assert [(c["platform"], c["id"]) for c in cs] == [("claude", "c-worked-in"), ("claude", "c-in-folder"), ("antigravity", "g-app")], \
        "newest first; opened in the folder or worked in it; the desks' sessions and other projects left out"
    assert cs[0]["title"] == "Opened elsewhere, worked here", "a title the user gave wins over the app's"
    assert cs[2]["title"] == "In the app" and cs[2]["cwd"].lower() == "e:/coding cli/project workdesk"
    assert [c["id"] for c in talk.conversations(OTHER, (REPO, OTHER))] == ["c-other"]
    assert len(talk.conversations(REPO, (REPO, OTHER), limit=1)) == 1


def test_a_conversation_that_grows_is_read_on_from_where_it_was_left(stores):
    claude, _ = stores
    talk.conversations(OTHER, (REPO, OTHER))
    p = claude / "projects" / "E--Coding-CLI-Project-NoteX" / "c-other.jsonl"
    with open(p, "a", encoding="utf8") as f:
        f.write(json.dumps({"type": "custom-title", "customTitle": "Renamed later", "sessionId": "c-other"}) + "\n")
    assert talk.conversations(OTHER, (REPO, OTHER))[0]["title"] == "Renamed later"


def test_a_claude_copy_takes_a_new_id_beside_the_original_and_goes_without_trace(stores):
    claude, _ = stores
    orig = claude / "projects" / "E--Coding-CLI-Project-WorkDesk" / "c-in-folder.jsonl"
    before = hashlib.sha256(orig.read_bytes()).hexdigest()
    new, cwd, remove = talk.copy_claude("c-in-folder")
    copy = orig.with_name(new + ".jsonl")
    assert copy.exists() and cwd == REPO.replace("/", "\\")
    assert {json.loads(l)["sessionId"] for l in copy.read_text().splitlines()} == {new}
    assert "c-in-folder" not in [c["id"] for c in talk.conversations(REPO, (REPO,))] or new not in [c["id"] for c in talk.conversations(REPO, (REPO,))]
    remove()
    assert not copy.exists() and hashlib.sha256(orig.read_bytes()).hexdigest() == before


def test_an_antigravity_copy_goes_to_agys_store_under_its_id_and_its_traces_go_with_it(stores):
    _, gemini = stores
    cli = gemini / "antigravity-cli"
    cid, remove = talk.copy_agy("g-app")
    dst = cli / "conversations" / "g-app.db"
    assert cid == "g-app" and dst.exists()
    (cli / "brain" / "g-app").mkdir(parents=True)
    with sqlite3.connect(cli / "conversation_summaries.db") as c:
        c.execute("CREATE TABLE conversation_summaries (conversation_id TEXT)")
        c.execute("INSERT INTO conversation_summaries VALUES ('g-app'), ('someone-else')")
    with pytest.raises(FileExistsError):
        talk.copy_agy("g-app")
    remove()
    assert not dst.exists() and not (cli / "brain" / "g-app").exists()
    with sqlite3.connect(cli / "conversation_summaries.db") as c:
        assert [r[0] for r in c.execute("SELECT conversation_id FROM conversation_summaries")] == ["someone-else"]
    assert (gemini / "antigravity" / "conversations" / "g-app.db").exists(), "the app's own file stays"


def _until(t, states, wait=60):
    end = time.time() + wait
    while time.time() < end:
        if t.state in states:
            return
        time.sleep(0.05)
    raise AssertionError(f"still {t.state}: {t.error}")


@pytest.fixture
def agent(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTOMATU_TALK_AGENT", json.dumps([sys.executable, str(Path(__file__).with_name("fake_acp.py"))]))
    monkeypatch.setattr(talk, "_TALKS", {})


def test_a_task_runs_in_a_copy_and_shows_the_reply_the_steps_and_the_ask(stores, agent, tmp_path):
    claude, _ = stores
    folder = claude / "projects" / "E--Coding-CLI-Project-WorkDesk"
    before = sorted(p.name for p in folder.iterdir())
    os.makedirs(REPO, exist_ok=True) if False else None
    t = talk.start("Work Desks", str(tmp_path), "claude", "c-in-folder", "WHERE\nTOOL Read notes\nASK Edit x.py\nSAY done")
    _until(t, {"asking"})
    assert t.view()["ask"]["title"] == "Edit x.py" and [o["id"] for o in t.view()["ask"]["options"]] == ["allow", "always", "deny"]
    assert "c-in-folder" not in t.view()["reply"] and "replayed" not in t.view()["reply"], "a loaded conversation's old turns are not shown"
    assert len(list(folder.iterdir())) == len(before) + 1, "a copy is being worked"
    assert t.answer("allow")
    _until(t, {"done"})
    v = t.view()
    assert "allowed allow" in v["reply"] and v["reply"].endswith("done")
    assert v["steps"][0]["title"] == "Read notes" and v["steps"][0]["status"] == "completed"
    assert sorted(p.name for p in folder.iterdir()) == before, "the copy is gone, the original stays"
    assert talk.latest("Work Desks") is t


def test_a_refused_ask_and_a_stop_are_the_users(stores, agent, tmp_path):
    t = talk.start("Work Desks", str(tmp_path), "claude", "c-in-folder", "ASK Run tests\nSAY after")
    _until(t, {"asking"})
    assert t.answer(None)
    _until(t, {"done"})
    assert "refused" in t.view()["reply"]
    with pytest.raises(ValueError):
        talk.start("Work Desks", str(tmp_path), "claude", "c-in-folder", "   ")
    s = talk.start("Work Desks", str(tmp_path), "antigravity", "g-app", "SLOW 20")
    with pytest.raises(RuntimeError):
        talk.start("Work Desks", str(tmp_path), "claude", "c-in-folder", "SAY two at once")
    _until(s, {"working"})
    s.stop()
    _until(s, {"stopped"})
    assert not (Path(os.environ["AUTOMATU_GEMINI_HOME"]) / "antigravity-cli" / "conversations" / "g-app.db").exists()


def test_the_page_may_give_a_task_only_from_automatus_own_page(monkeypatch):
    from fastapi.testclient import TestClient
    from automatu import serve
    monkeypatch.setattr(serve, "_talk_place", lambda canvas: (REPO, (REPO,)))
    monkeypatch.setattr(serve, "_talk_desk", lambda canvas: None)
    import automatu.notices
    monkeypatch.setattr(automatu.notices, "agents", lambda: [])
    started = []
    monkeypatch.setattr(talk, "conversations", lambda repo, repos=None, limit=5: [{"platform": "claude", "id": "c1", "title": "x", "at": "", "cwd": ""}])
    monkeypatch.setattr(talk, "start", lambda *a: started.append(a) or type("T", (), {"view": lambda self: {
        "id": "talk-1", "canvas": "Work Desks", "platform": "claude", "conversation": "c1", "text": "hi", "state": "starting", "started": "now"}})())
    c = TestClient(serve.app)
    body = {"canvas": "Work Desks", "platform": "claude", "conversation": "c1", "text": "hi"}
    assert c.post("/api/talk", json=body, headers={"origin": "https://evil.example"}).status_code == 403
    assert c.post("/api/talk", json={**body, "conversation": "not-theirs"}, headers={"origin": "http://testserver"}).status_code == 400
    r = c.post("/api/talk", json=body, headers={"origin": "http://testserver"})
    assert r.status_code == 200 and r.json()["state"] == "starting" and started[0][:4] == ("Work Desks", REPO, "claude", "c1")
    monkeypatch.setattr(serve, "_talk_place", lambda canvas: (None, ()))
    assert "plans no repository" in c.get("/api/talk", params={"canvas": "Resume"}).json()["note"]


def test_a_desk_canvas_finds_the_conversations_that_sat_at_its_desk(stores):
    """PortFolio plans no repository; it is the Portfolio desk's Main canvas, and
    its agents are the conversations that called Knowledge Desk's sit for it."""
    claude, _ = stores
    d = claude / "projects" / "E--Coding-CLI"
    rows = [{"type": "user", "cwd": "E:\Coding CLI", "entrypoint": "claude-desktop", "sessionId": "c-sat", "message": {"content": "sit"}},
            {"type": "assistant", "sessionId": "c-sat", "message": {"content": [
                {"type": "tool_use", "name": "mcp__knowledgedesk__sit", "input": {"desk": "Portfolio", "agent": "Claude Code"}}]}},
            {"type": "custom-title", "customTitle": "Portfolio desk", "sessionId": "c-sat"}]
    d.mkdir(parents=True, exist_ok=True)
    (d / "c-sat.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf8")
    found = talk.desk_conversations({"Portfolio", "portfolio"})
    assert [(c["id"], c["title"], c["cwd"]) for c in found] == [("c-sat", "Portfolio desk", "E:\Coding CLI")]
    assert talk.desk_conversations({"resume maker"}) == [] and talk.desk_conversations(set()) == []
    assert "c-sat" not in [c["id"] for c in talk.conversations(REPO, (REPO,))], "sitting at a desk is not working on a project"


def test_the_hex_of_a_desk_canvas_says_who_sits_there(monkeypatch):
    from fastapi.testclient import TestClient
    from automatu import serve
    monkeypatch.setattr(serve, "_talk_place", lambda canvas: (None, ()))
    monkeypatch.setattr(serve, "_talk_desk", lambda canvas: {"name": "Portfolio", "slug": "portfolio", "owner": "portfolio",
        "sitting": [{"agent": "Claude Code", "client": "claude-code 2.1.325", "since": "2026-11-14T10:24:17Z", "away": False}]} if canvas == "PortFolio" else None)
    monkeypatch.setattr(talk, "desk_conversations", lambda desks, repos=(), limit=5: [{"platform": "claude", "id": "c-sat", "title": "Portfolio desk", "at": "2026-11-14T10:25:00+00:00", "cwd": "E:\Coding CLI"}] if "portfolio" in {x.lower() for x in desks} else [])
    started = []
    monkeypatch.setattr(talk, "start", lambda *a: started.append(a) or type("T", (), {"view": lambda self: {
        "id": "talk-2", "canvas": "PortFolio", "platform": "claude", "conversation": "c-sat", "text": "hi", "state": "starting", "started": "now"}})())
    c = TestClient(serve.app)
    v = c.get("/api/talk", params={"canvas": "PortFolio"}).json()
    assert (v["desk"], v["agents"], v["sitting"][0]["agent"], [x["id"] for x in v["conversations"]]) == ("Portfolio", ["Claude Code"], "Claude Code", ["c-sat"])
    r = c.post("/api/talk", json={"canvas": "PortFolio", "platform": "claude", "conversation": "c-sat", "text": "hi"}, headers={"origin": "http://testserver"})
    assert r.status_code == 200 and started[0][:4] == ("PortFolio", "E:\Coding CLI", "claude", "c-sat"), "it works in the conversation's own folder"
    assert "no desk's Main canvas" in c.get("/api/talk", params={"canvas": "Resume"}).json()["note"]
