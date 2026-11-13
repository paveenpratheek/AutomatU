import numpy as np
import pytest

from automatu.align import Numbers, place_regions

A = lambda *x: np.array(x, dtype=float)
SECTIONS = {"A": A(1, 0, 0), "B": A(0, 1, 0), "C": A(0.7071, 0.7071, 0)}


def one(vec, sections=SECTIONS, **n):
    return place_regions({"r": A(*vec)}, sections, Numbers(**n))[0]


def test_a_clear_match_is_placed_under_its_section():
    p = one((1, 0, 0), min_score=0.5, min_margin=0.1)
    assert p.section == "A" and p.best == "A"


def test_a_match_too_close_to_the_runner_up_waits_with_its_nearest_kept():
    # C at about 0.95, B at about 0.89: strong, but only 0.06 apart.
    p = one((0.45, 0.89, 0), min_score=0.5, min_margin=0.1)
    assert p.section is None and p.best == "C" and p.margin < 0.1


def test_a_weak_match_waits_however_far_ahead():
    assert one((0.3, 0, 0.95), min_score=0.5, min_margin=0).section is None


def test_two_sections_about_equal_share_the_region_like_a_venn_overlap():
    two = {"D": A(1, 0.1, 0), "E": A(1, -0.15, 0), "F": A(0, 0, 1)}
    p = one((1, 0, 0.1), two, min_score=0.5, min_margin=0.1, overlap=0.05)
    assert p.sections == ["D", "E"] and p.section == "D"
    q = one((1, 0, 0.1), two, min_score=0.5, min_margin=0.1, overlap=0)
    assert q.sections == [] and q.near == ["D"], "without an overlap the two are too close to choose between"


def test_the_shared_group_must_still_lead_the_rest():
    close = {"D": A(1, 0.1, 0), "E": A(1, -0.15, 0), "G": A(1, 0.3, 0.1)}
    assert one((1, 0, 0.1), close, min_score=0.5, min_margin=0.1, overlap=0.02, max_shared=2).sections == []


def test_placing_without_calibrated_numbers_is_refused():
    with pytest.raises(ValueError, match="calibration"):
        place_regions({}, SECTIONS, None)


def test_a_close_call_is_settled_by_its_neighbours_only_when_they_agree():
    from types import SimpleNamespace as R
    from automatu.align import Numbers, Vote, decide, neighbours_of, vote
    regions = [R(id=i, file=f) for i, f in (("a", "x.py"), ("b", "x.py"), ("c", "x.py"), ("d", "y.py"), ("e", "z.py"))]
    nb = neighbours_of(regions, [("d", "a"), ("e", "e")])
    assert nb["a"] == {"b", "c", "d"} and nb["d"] == {"a"} and nb["e"] == set(), "file mates, uses both ways, never itself"
    n = Numbers(min_score=0.76, min_margin=0.04, vote=Vote(top=2, min_votes=2, share=0.6))
    ranked = {"a": [("P", 0.80), ("Q", 0.79)], "b": [("P", 0.90), ("Q", 0.70)], "c": [("P", 0.88), ("Q", 0.60)],
              "d": [("Q", 0.85), ("P", 0.60)], "e": [("P", 0.70), ("Q", 0.69)]}
    decided = [(r, decide(rk, n), rk) for r, rk in ranked.items()]
    assert vote(decided, nb, n) == 1
    got = {r: (d["sections"], d.get("voted", False)) for r, d, _ in decided}
    assert got["a"] == (["P"], True), "b and c placed under P: two of its three placed neighbours"
    assert got["e"] == ([], False), "below the score bar: never voted on"
    n.vote = Vote(top=2, min_votes=2, share=0.9)
    decided = [(r, decide(rk, n), rk) for r, rk in ranked.items()]
    assert vote(decided, nb, n) == 0, "two of three is not 90%: it waits"
    assert vote(decided, nb, Numbers(min_score=0.76, min_margin=0.04)) == 0, "no vote configured: nothing changes"
