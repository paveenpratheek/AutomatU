"""The canvases the user added (box 24, t-4fb5a8ff46): only these are in
AutomatU; NoteX's list is a stand-in here, never the user's canvases."""
import subprocess

import pytest

NOTEX = [{"name": "Portfolio", "rules": False, "agent": True},
         {"name": "Ruling Test", "rules": True, "agent": False},
         {"name": "Plan Z", "rules": False, "agent": False}]
fabrics = lambda: NOTEX


@pytest.fixture
def clean(store):
    store.db().execute("DELETE FROM added_canvas")
    store.db().execute("DELETE FROM binding")
    yield store
    store.db().execute("DELETE FROM added_canvas")
    store.db().execute("DELETE FROM binding")


def test_a_canvas_is_added_once_and_removed_once_each_kept_in_time(clean):
    from automatu.canvases import add, added, history, remove
    assert add("Portfolio", fabrics)["changed"] is True
    assert add("Portfolio", fabrics)["changed"] is False
    assert added() == ["Portfolio"]
    assert remove("Portfolio")["changed"] is True
    assert remove("Portfolio")["changed"] is False
    assert added() == []
    mine = [(h["canvas"], h["added"]) for h in history() if h["canvas"] == "Portfolio"]
    assert mine[-2:] == [("Portfolio", True), ("Portfolio", False)]


def test_only_a_canvas_notex_has_is_added_and_never_the_rules_canvas(clean):
    from automatu.canvases import add, added
    with pytest.raises(ValueError, match="NoteX has no canvas called 'Nope'"):
        add("Nope", fabrics)
    with pytest.raises(ValueError, match="rules canvas"):
        add("Ruling Test", fabrics)
    assert added() == []


def test_binding_adds_the_canvas_and_a_bound_canvas_stays_while_bound(clean, tmp_path):
    from automatu.binding import bind
    from automatu.canvases import added, remove
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    bind(str(tmp_path), "Plan Z", check=lambda c: None)
    assert added() == ["Plan Z"]
    with pytest.raises(ValueError, match="stays while that binding does"):
        remove("Plan Z")
    assert added() == ["Plan Z"]


def test_the_listing_says_what_is_in_automatu_and_what_notex_no_longer_has(clean):
    from automatu.canvases import add, listing
    add("Portfolio", fabrics)
    clean.db().execute("INSERT INTO added_canvas (canvas) VALUES ('Gone')")
    rows = {c["name"]: c for c in listing(fabrics)["canvases"]}
    assert rows["Portfolio"]["added"] and not rows["Plan Z"]["added"]
    assert rows["Ruling Test"]["rules"] is True
    assert rows["Gone"]["missing"] is True and rows["Gone"]["added"] is True


def test_the_mcp_answer_lists_the_added_canvases_with_their_repositories(clean):
    from automatu.canvases import add
    from automatu.context import canvases_answer
    add("Portfolio", fabrics)
    a = canvases_answer()
    assert [(c.canvas, c.repos) for c in a.canvases] == [("Portfolio", [])]
    assert a.canvases[0].added_at.endswith("Z")
