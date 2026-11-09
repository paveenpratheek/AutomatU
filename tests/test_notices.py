"""Notices (box 13): a built box the code moved past rings, work on a box
reworded for it is held, a later tick takes it off, and agents answer for
repositories in a log that is never overwritten."""
from types import SimpleNamespace as NS

import pytest

from automatu.notices import box_commits, box_events, state_at, ticked_by
from automatu.sources.canvas import sections, ticks_of


def plan(*boxes):
    """A plan version: (name, words) per box."""
    body = "".join(f'<Area name="{n}"><Note name="Built">{w}</Note></Area>' for n, w in boxes)
    return sections(f'<Canvas name="C"><Totem name="P">{body}</Totem></Canvas>')


def test_a_box_is_built_by_the_commits_on_its_ticked_lines():
    assert ticks_of("Built: - [x] The timeline (f436f41)\n- [ ] Later (t-6da95e49a7)\n- [x] Smooth (db79022, t-a6d44609ab)") == ["f436f41", "db79022"]
    assert ticks_of("- [x] Relations worked out (2445954)\n- [x] a group past 7 boxes splits (user)") == ["2445954"], "a hash of digits only"
    s = plan(("1. Read", "- [x] Reading GitX (9ef89d9)"))[0]
    assert s.ticks == ["9ef89d9"] and "9ef89d9" not in s.words, "the hash is a tick, never words alignment could place by"


def test_built_boxes_ring_open_boxes_hold_and_unticked_boxes_say_nothing():
    v = [("2026-11-09T08:00:00Z", plan(("1. Read", "- [ ] read it"), ("2. Map", "- [ ] draw it"))),
         ("2026-11-09T09:00:00Z", plan(("1. Read", "- [x] read it (aaaa111)"), ("2. Map", "- [ ] draw it"))),
         ("2026-11-09T11:00:00Z", plan(("1. Read", "- [x] read it (aaaa111)\n- [ ] read faster"), ("2. Map", "- [ ] draw it"))),
         ("2026-11-09T13:00:00Z", plan(("1. Read", "- [x] read it (aaaa111)\n- [x] read faster (bbbb222)"), ("2. Map", "- [ ] draw it")))]
    ev, _ = box_events(v)
    read, draw = ev["P (totem) > 1. Read"], ev["P (totem) > 2. Map"]
    assert state_at(read, "2026-11-09T08:30:00Z") is None, "not built yet: being built"
    assert state_at(read, "2026-11-09T10:00:00Z") == "behind", "built, and nobody planned work on it"
    assert state_at(read, "2026-11-09T12:00:00Z") == "progress", "reworded after its tick: planned work"
    assert state_at(read, "2026-11-09T14:00:00Z") == "behind", "ticked again: back to built"
    assert state_at(draw, "2026-11-09T14:00:00Z") is None, "never ticked: raises nothing"
    at = {"aaaa111": "2026-11-09T08:50:00Z", "bbbb222": "2026-11-09T12:30:00Z"}.get
    assert ticked_by(read, "2026-11-09T12:00:00Z", at) == "bbbb222", "a later tick naming a later commit takes it off"
    assert ticked_by(read, "2026-11-09T12:40:00Z", at) is None, "a commit after the ticked one is not covered"


def test_a_renamed_box_keeps_its_history():
    lines = "- [x] reads the code regions (aaaa111)\n- the commits behind them\n- the thoughts they settled"
    v = [("2026-11-09T08:00:00Z", plan(("1. Read", lines))),
         ("2026-11-09T09:00:00Z", plan(("1. Sources", lines)))]
    ev, alias = box_events(v)
    assert alias == {"P (totem) > 1. Read": "P (totem) > 1. Sources"}
    assert state_at(ev["P (totem) > 1. Sources"], "2026-11-09T10:00:00Z") == "behind", "the rename is not a reword"


def test_each_box_gets_the_commits_whose_lines_are_under_it_and_bulk_commits_are_left_out():
    R = lambda i, commits: NS(id=i, file=i.split("::")[0], name=i.split("::")[1], start=1, end=9, commits=commits)
    regions = [R("a.py::f", [("c1", 4), ("big", 1)]), R("a.py::g", [("c2", 2), ("big", 1)]), R("b.py::h", [("big", 3)]),
               R("b.py::k", [("c1", 1), ("big", 1)])] + [R(f"c.py::z{i}", [(f"z{i}", 2)]) for i in range(6)]
    places = [{"region": "a.py::f", "sections": ["X", "Y"]}, {"region": "a.py::g", "sections": ["X"]},
              {"region": "b.py::h", "sections": ["Y"]}, {"region": "b.py::k", "sections": ["Y"]}] + \
             [{"region": f"c.py::z{i}", "sections": ["Z"]} for i in range(6)]
    got = box_commits(places, NS(regions=regions))
    assert {sha: [x.id for x in xs] for sha, xs in got["X"]} == {"c1": ["a.py::f"], "c2": ["a.py::g"]}, "a shared region counts for both boxes"
    assert {sha: [x.id for x in xs] for sha, xs in got["Y"]} == {"c1": ["a.py::f", "b.py::k"]}, "a commit behind most of the code is no one box's"


def sha(short):
    """A commit hash for a test commit named like c1: c1c1c1c1."""
    return (short * 4)[:8]


def item(box, name, state, at="2026-11-09T10:00:00Z", ticked=None):
    return {"box": box, "sha": sha(name), "at": at, "subject": "s " + name, "state": state, "ticked_by": ticked and sha(ticked),
            "regions": [{"id": "a.py::f", "file": "a.py", "name": "f", "start": 1, "end": 9}]}


def test_one_open_row_per_box_closed_by_an_agent_or_by_its_ticks(store):
    from automatu.notices import close_notice, merge, notices
    R = "E:/x/N"
    assert merge(R, [item("B1", "c1", "behind"), item("B1", "c2", "behind", "2026-11-09T11:00:00Z"), item("B2", "c3", "progress"),
                     item("B3", "c0", "behind", ticked="c9")]) == {"added": 3, "closed": 0}
    n = notices(R)
    assert n["count"] == 1 and [x["box"] for x in n["behind"]] == ["B1"] and [c["sha"] for c in n["behind"][0]["commits"]] == [sha("c1"), sha("c2")]
    assert [x["box"] for x in n["progress"]] == ["B2"], "work in progress is listed apart and not counted"
    assert merge(R, [item("B1", "c1", "behind")])["added"] == 0, "a commit already on the row is not added twice"

    with pytest.raises(ValueError):
        close_notice(n["behind"][0]["id"], "done", "", "claude-automatu-builder")
    close_notice(n["behind"][0]["id"], "still-right", "only a rename", "claude-automatu-builder")
    assert merge(R, [item("B1", "c1", "behind"), item("B1", "c4", "behind", "2026-11-09T12:00:00Z")])["added"] == 1, \
        "a closed row's commits stay closed; a new one opens a new row"
    n = notices(R)
    assert [c["sha"] for c in n["behind"][0]["commits"]] == [sha("c4")] and n["closed"][0]["closed_how"] == "still-right"

    assert merge(R, [item("B2", "c3", "progress", ticked="c5")]) == {"added": 0, "closed": 1}, "ticked on its box: it closes itself"
    assert notices(R)["closed"][0]["closed_how"] == "ticked" and not notices(R)["progress"]


def test_agents_answer_for_repositories_in_a_log_never_overwritten(store, monkeypatch):
    from automatu import notices as N
    monkeypatch.setattr(N, "repo_key", lambda d: d)
    monkeypatch.setattr(N, "binding_of", lambda d: {"repo": d} if d.startswith("E:/") else None)
    assert N.register("claude-automatu-builder", "E:/x/A")["changed"] is True
    assert N.register("claude-automatu-builder", "E:/x/A")["changed"] is False, "registering again changes nothing"
    with pytest.raises(ValueError):
        N.register("claude-automatu-builder", "not-bound")
    N.register("resume-agent", "E:/x/A")
    N.leave("resume-agent", "E:/x/A")
    got = {g["agent"]: [r["repo"] for r in g["repos"]] for g in N.agents()}
    assert got == {"claude-automatu-builder": ["E:/x/A"]}
    from automatu.store import db
    assert db().execute("SELECT count(*) FROM agent_log WHERE agent = 'resume-agent'").fetchone()[0] == 2, "the step-down is kept"
