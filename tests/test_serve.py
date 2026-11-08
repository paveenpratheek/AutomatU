"""The map view: read-only, and says so when there is nothing to show."""


def test_the_map_view_serves_the_page_and_says_when_there_is_no_map(store):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    c = TestClient(app)
    assert c.get("/").status_code == 200
    assert c.get("/api/repos").json() == {"repos": []}
    assert c.get("/api/map", params={"repo": "Z:/not-a-repo-anywhere"}).status_code == 400
