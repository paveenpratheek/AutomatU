import numpy as np

from automatu.embed import cosine
from automatu.profile import live_thoughts, mix
from automatu.sources.gitx import Thought


def t(i, outcome, links=()):
    return Thought(id=i, graph="settled", kind="decision", outcome=outcome, text=i, commit="", resulted="", links=list(links))


def test_rejected_stashed_and_superseded_thoughts_are_not_what_the_code_does():
    live = live_thoughts({
        "a": t("a", "accepted"), "b": t("b", "rejected"), "c": t("c", "stashed"),
        "d": t("d", "accepted"), "e": t("e", "accepted", [{"type": "supersedes", "to": "d"}]), "f": t("f", "open"),
    })
    assert sorted(live) == ["a", "e", "f"]


def test_a_mix_leans_toward_the_heavier_part_and_is_unit_length():
    v = mix([(np.array([1.0, 0.0]), 0.75), (np.array([0.0, 1.0]), 0.25)])
    assert v[0] > v[1]
    assert abs(np.linalg.norm(v) - 1) < 1e-9


def test_nothing_with_weight_gives_no_vector():
    assert mix([(None, 1), (np.array([1.0, 0.0]), 0)]) is None


def test_cosine_of_a_vector_with_itself_is_one():
    assert abs(cosine(np.array([0.3, 0.4]), np.array([0.3, 0.4])) - 1) < 1e-12
