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
    monkeypatch.setattr(views, "all_bindings", lambda: [{"repo": "E:/x/R", "canvas": "C", "totem": "Plan"}])
    monkeypatch.setattr(views, "read_canvas_raw", lambda name: {"script": '<Canvas name="C"><Totem name="Plan"><Area name="1. Read"/></Totem></Canvas>', "agent": True})
    c = TestClient(app)
    j = c.get("/api/canvases").json()
    assert j["canvases"][0]["name"] == "C" and j["canvases"][0]["agent"] is True
    assert j["canvases"][0]["totems"][0]["boxes"][0]["name"] == "1. Read"
    assert j["canvases"][0]["repos"] == [{"repo": "E:/x/R", "name": "R", "totem": "Plan"}]
    monkeypatch.setattr(views, "latest_map", lambda repo: None)
    assert c.get("/api/code", params={"repo": "E:/x/R"}).status_code == 404
