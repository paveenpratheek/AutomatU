"""The map view: read-only, and says so when there is nothing to show."""


def test_the_map_view_serves_the_page_and_says_when_there_is_no_map(store):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    c = TestClient(app)
    assert c.get("/").status_code == 200
    assert c.get("/api/repos").json() == {"repos": []}
    assert c.get("/api/map", params={"repo": "Z:/not-a-repo-anywhere"}).status_code == 400


def test_the_main_and_code_maps_read_through_the_api(store, monkeypatch):
    from fastapi.testclient import TestClient
    from automatu import views
    from automatu.serve import app
    import automatu.canvases as canvases
    monkeypatch.setattr(canvases, "added", lambda: ["C", "Notes"])   # the canvases the user added (box 24)
    monkeypatch.setattr(views, "all_bindings", lambda: [{"repo": "E:/x/R", "canvas": "C", "totem": "Plan"},
                                                        {"repo": "E:/x/S", "canvas": "Not added", "totem": None}])
    monkeypatch.setattr(views, "read_canvas_raw", lambda name: {"script": '<Canvas name="C"><Totem name="Plan"><Area name="1. Read"/></Totem></Canvas>', "agent": True})
    c = TestClient(app)
    j = c.get("/api/canvases").json()
    assert [x["name"] for x in j["canvases"]] == ["C", "Notes"], "only the added canvases, bound or not"
    assert j["canvases"][1]["repos"] == []
    assert j["canvases"][0]["name"] == "C" and j["canvases"][0]["agent"] is True
    assert j["canvases"][0]["totems"][0]["boxes"][0]["name"] == "1. Read"
    assert j["canvases"][0]["repos"] == [{"repo": "E:/x/R", "name": "R", "totem": "Plan"}]
    monkeypatch.setattr(views, "latest_map", lambda repo: None)
    assert c.get("/api/code", params={"repo": "E:/x/R"}).status_code == 404


def test_adding_and_removing_a_canvas_is_taken_only_from_automatus_own_page(store, monkeypatch):
    from fastapi.testclient import TestClient
    import automatu.canvases as canvases
    from automatu.serve import app
    monkeypatch.setattr(canvases, "_notex_fabrics", lambda: [{"name": "Portfolio"}])
    store.db().execute("DELETE FROM added_canvas WHERE canvas = 'Portfolio'")
    c = TestClient(app)
    assert c.post("/api/canvases/add", json={"canvas": "Portfolio"}, headers={"origin": "http://evil.example"}).status_code == 403
    r = c.post("/api/canvases/add", json={"canvas": "Portfolio"}, headers={"origin": "http://testserver"}).json()
    assert r == {"canvas": "Portfolio", "changed": True, "problem": None}
    assert c.post("/api/canvases/add", json={"canvas": "Nope"}, headers={"origin": "http://testserver"}).json()["problem"]
    assert c.get("/api/canvases/available").json()["canvases"][0]["added"] is True
    assert c.post("/api/canvases/remove", json={"canvas": "Portfolio"}, headers={"origin": "http://testserver"}).json()["changed"]
    assert c.get("/api/canvas-image", params={"canvas": "Portfolio", "id": "x"}).status_code == 404


def test_a_repository_is_linked_from_a_canvas_hex_as_automatu_bind_links_it(store, tmp_path, monkeypatch):
    """Box 31: the page offers the git repositories beside the ones AutomatU
    knows and links one with its plan totem - from this page only, with bind's
    own checks, and a move only when the user confirmed it."""
    import os
    import subprocess
    from fastapi.testclient import TestClient
    import automatu.sources.canvas as canvas_source
    from automatu.binding import binding_history, binding_of, bind, repo_key
    from automatu.serve import app
    for name in ("Project A", "Project B"):
        (tmp_path / name).mkdir()
        subprocess.run(["git", "init", "-q"], cwd=tmp_path / name, check=True)
    (tmp_path / "Project B" / ".gitx").mkdir()
    (tmp_path / "Not a repo").mkdir()
    script = '<Canvas name="H"><Totem name="RAGX"><Area name="1. Search"/></Totem><Totem name="NoteX"><Area name="1. Read"/></Totem></Canvas>'
    monkeypatch.setattr(canvas_source, "read_canvas_script", lambda name: script)
    a, b = str(tmp_path / "Project A"), str(tmp_path / "Project B")
    bind(a, "H", totem="NoteX", check=lambda name: script)
    c = TestClient(app)
    page = {"origin": "http://testserver"}

    near = {r["name"]: r for r in c.get("/api/bind/repos").json()["repos"] if r["repo"].startswith(repo_key(a).rsplit("/", 1)[0])}
    assert set(near) == {"Project A", "Project B"}, "only git repositories are offered"
    assert near["Project A"]["canvas"] == "H" and near["Project A"]["totem"] == "NoteX"
    assert near["Project B"]["canvas"] is None and near["Project B"]["gitx"] is True and near["Project A"]["gitx"] is False

    # Typed as the user's own system writes a folder, with its separator at the
    # end: backslashes on Windows; on Linux a backslash is no separator.
    ask = {"repo": b.replace("/", os.sep) + os.sep, "canvas": "H", "totem": "RAGX"}
    assert c.post("/api/bind", json=ask, headers={"origin": "http://evil.example"}).status_code == 403
    assert binding_of(b) is None
    assert "no totem named Nope" in c.post("/api/bind", json={**ask, "totem": "Nope"}, headers=page).json()["problem"]
    assert binding_of(b) is None
    r = c.post("/api/bind", json=ask, headers=page).json()
    assert r["changed"] is True and r["repo"] == repo_key(b) and r["totem"] == "RAGX" and r["problem"] is None
    assert binding_of(b)["totem"] == "RAGX"

    assert "not a git repository" in c.post("/api/bind", json={**ask, "repo": str(tmp_path / "Not a repo")}, headers=page).json()["problem"]
    moved = {"repo": a, "canvas": "H", "totem": "RAGX"}
    assert "already bound to the canvas H" in c.post("/api/bind", json=moved, headers=page).json()["problem"]
    assert binding_of(a)["totem"] == "NoteX", "nothing moves without the user's confirm"
    r = c.post("/api/bind", json={**moved, "replace": True}, headers=page).json()
    assert r["changed"] is True and r["was"] == "H > NoteX"
    assert [h["totem"] for h in binding_history(repo_key(a))] == ["NoteX", "RAGX"], "every change is kept in the binding log"
