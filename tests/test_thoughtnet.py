from automatu.sources.gitx import Commit, Region, Repo, Thought
from automatu.thoughtnet import region_net


def T(i, commit="", resulted="", links=()):
    return Thought(id=i, graph="settled", kind="decision", outcome="accepted", text="thought " + i,
                   commit=commit, resulted=resulted, links=[{"type": k, "to": to} for k, to in links])


def repo():
    thoughts = {t.id: t for t in [
        T("t-cited", links=[("refines", "t-older")]),
        T("t-older"),
        T("t-points-here", links=[("supports", "t-cited")]),
        T("t-on-commit", resulted="aaaaaaaaaaaa"),
        T("t-elsewhere", resulted="bbbbbbbbbbbb"),
    ]}
    regions = [
        Region(id="a.py::f", file="a.py", name="def f():", kind=None, start=1, end=9,
               commits=[("aaaaaaaaaaaa", 9)], thoughts=[], cites=["t-cited"]),
        Region(id="b.py::g", file="b.py", name="def g():", kind=None, start=1, end=3,
               commits=[("bbbbbbbbbbbb", 3)], thoughts=[], cites=["t-elsewhere"]),
    ]
    commits = {"aaaaaaaaaaaa": Commit(sha="aaaaaaaaaaaa", date="2026-11-09", subject="feat: f", body="")}
    return Repo(dir="x", head="h", regions=regions, commits=commits, thoughts=thoughts)


def test_cited_then_linked_either_way_then_recorded_on_its_commits():
    n = region_net(repo(), "a.py::f")
    roles = {i: n["thoughts"][i]["role"] for i in n["order"]}
    assert roles == {"t-cited": "cited", "t-older": "linked", "t-points-here": "linked", "t-on-commit": "commit"}
    assert {(e["a"], e["b"], e["kind"]) for e in n["edges"]} >= {("#", "t-cited", "cites"), ("#", "t-on-commit", "commit"),
                                                                 ("t-cited", "t-older", "refines"), ("t-points-here", "t-cited", "supports")}
    assert n["commits"] == [{"sha": "aaaaaaa", "date": "2026-11-09", "subject": "feat: f"}]


def test_a_thought_is_current_only_while_some_code_cites_it():
    n = region_net(repo(), "a.py::f")
    assert n["thoughts"]["t-cited"]["current"] and not n["thoughts"]["t-older"]["current"]
    assert region_net(repo(), "nowhere") is None
