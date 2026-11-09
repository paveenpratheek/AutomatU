"""Typed data (t-e7dd1752e3): a bad notice entry and a bad calibration.json
are refused where they are made, with the field named, and the API's
answers are typed and published."""
import json
from pathlib import Path

import pytest

from automatu.maps import CALIBRATION, load_calibration


def entry(**over):
    e = {"sha": "024706cca3c8", "at": "2026-11-09T15:43:56.000Z", "subject": "a comment", "state": "behind", "ticked_by": None,
         "regions": [{"id": "a.py::f", "file": "a.py", "name": "def f():", "start": 21, "end": 81}]}
    return e | over


def test_a_notice_entry_with_a_wrong_or_misspelled_field_is_refused_with_the_field_named(store):
    from automatu.notices import _checked, merge
    assert _checked("B", [entry()])[0]["sha"] == "024706cca3c8"
    with pytest.raises(ValueError, match="state"):
        _checked("B", [entry(state="late")])
    with pytest.raises(ValueError, match="sha"):
        _checked("B", [entry(sha="not-a-hash")])
    with pytest.raises(ValueError, match="regions.0: .*ends at line 4, before it starts at 30"):
        _checked("B", [entry(regions=[{"id": "a.py::f", "file": "a.py", "name": "f", "start": 30, "end": 4}])])
    bad = entry(subjct="misspelled")
    with pytest.raises(ValueError, match="subjct"):
        _checked("B", [bad])
    with pytest.raises(ValueError, match="at"):
        _checked("B", [entry(at="9 Nov, 21:13 IST")])
    item = {"box": "B", "sha": "024706cca3c8", "at": "2026-11-09T15:43:56.000Z", "subject": "s", "state": "behind", "ticked_by": None,
            "regions": []}
    with pytest.raises(ValueError, match="regions"):
        merge("E:/x/M", [item])
    from automatu.store import db
    assert db().execute("SELECT count(*) FROM notice WHERE repo = 'E:/x/M'").fetchone()[0] == 0, "nothing is written when an entry is refused"


def test_calibration_json_is_checked_as_it_is_loaded():
    real = CALIBRATION.read_text(encoding="utf-8")
    assert load_calibration(real).minScore == json.loads(real)["minScore"], "the file in use passes"
    for broken, field in ((lambda c: c.pop("minMargin"), "minMargin"),
                          (lambda c: c.__setitem__("minScor", c.pop("minScore")), "minScore"),
                          (lambda c: c["selfTest"].__setitem__("minPrecision", 1.4), "selfTest.minPrecision")):
        c = json.loads(real)
        broken(c)
        with pytest.raises(RuntimeError, match=field.replace(".", r"\.")):
            load_calibration(json.dumps(c))


def test_the_api_answers_are_typed_and_their_schema_is_served(store):
    from fastapi.testclient import TestClient
    from automatu.serve import app
    c = TestClient(app)
    schema = c.get("/api/openapi.json").json()
    shapes = schema["components"]["schemas"]
    for name in ("NoticesAnswer", "Notice", "NoticeCommit", "RegionRef", "AgentsAnswer", "Timeline", "Phase"):
        assert name in shapes, name
    assert set(shapes["NoticeCommit"]["properties"]["state"]["enum"]) == {"behind", "progress", "ticked"}
    n = c.get("/api/notices")
    assert n.status_code == 200 and set(n.json()) == {"count", "behind", "progress", "closed"}
    assert c.get("/api/agents").status_code == 200 and "agents" in c.get("/api/agents").json()
    assert c.get("/docs").status_code == 404, "the schema is published; no docs page is added"
