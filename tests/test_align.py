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
