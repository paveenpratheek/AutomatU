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
