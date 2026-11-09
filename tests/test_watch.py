"""The live map's watcher: a new map when a repository changed, nothing when it
did not, and one failing repository never stops the others."""
from automatu import watch


def test_the_watcher_maps_what_changed_and_survives_a_failure(monkeypatch):
    bindings = [{"repo": "A"}, {"repo": "B"}, {"repo": "C"}]
    reasons = {"A": "new commit", "B": None}
    made, logs = [], []

    def needs_map(b):
        if b["repo"] == "C":
            raise RuntimeError("NoteX is not running")
        return reasons[b["repo"]]

    def make_map(repo):
        made.append(repo)
        return {"run": 1, "repo": repo, "placed": 3, "regions": 5}

    monkeypatch.setattr(watch, "all_bindings", lambda: bindings)
    monkeypatch.setattr(watch, "needs_map", needs_map)
    monkeypatch.setattr(watch, "make_map", make_map)
    noticed = []
    monkeypatch.setattr(watch, "refresh", lambda repo: noticed.append(repo) or {"added": 0, "closed": 0})
    w = watch.Watcher(log=logs.append)

    assert [m["repo"] for m in w.check_once()] == ["A"]
    assert made == ["A"], "B had no change, C failed"
    assert sum("could not check C" in l for l in logs) == 1
    assert noticed == ["A", "B"], "notices after a new map, and once for a repository already mapped"

    reasons["A"] = None
    assert w.check_once() == []
    assert sum("could not check C" in l for l in logs) == 1, "the same failure is said once, not every few seconds"
