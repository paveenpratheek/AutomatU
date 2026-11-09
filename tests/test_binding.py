import subprocess

import pytest

from automatu.sources.canvas import sections

SCRIPT = '<Canvas name="P"><Totem name="Plan"><Area name="1. Read"/><Area name="2. Show"/></Totem><Totem name="Rules"><Area name="Code is truth"/></Totem></Canvas>'
ok = lambda canvas: None
has = lambda canvas: SCRIPT


@pytest.fixture
def repo(tmp_path):
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    return str(tmp_path)


def test_a_repository_is_one_key_however_written(store, repo):
    from automatu.binding import repo_key
    k = repo_key(repo)
    assert repo_key(repo + "/") == k and "\\" not in k


def test_bind_once_and_again_to_the_same_canvas_changes_nothing(store, repo):
    from automatu.binding import bind, binding_of
    assert bind(repo, "Plan A", check=ok)["changed"] is True
    assert bind(repo, "Plan A", check=ok)["changed"] is False
    assert binding_of(repo)["canvas"] == "Plan A"


def test_a_second_canvas_is_refused_unless_replaced(store, repo):
    from automatu.binding import bind, repo_key, repos_of
    bind(repo, "Plan A", check=ok)
    with pytest.raises(ValueError, match="already bound to the canvas Plan A"):
        bind(repo, "Plan B", check=ok)
    assert bind(repo, "Plan B", check=ok, replace=True)["was"] == "Plan A"
    assert repo_key(repo) in repos_of("Plan B")
    assert repo_key(repo) not in repos_of("Plan A")


def test_a_canvas_that_does_not_exist_is_not_bound(store, repo):
    from automatu.binding import bind, binding_of

    def missing(_):
        raise RuntimeError("no such canvas")

    with pytest.raises(RuntimeError, match="no such canvas"):
        bind(repo, "Nope", check=missing)
    assert binding_of(repo) is None


def test_naming_the_plan_totem_limits_the_sections(store, repo):
    from automatu.binding import bind, binding_of, plan_sections
    bind(repo, "P", check=has)
    with pytest.raises(ValueError, match="no totem named Nope"):
        bind(repo, "P", totem="Nope", check=has)
    assert bind(repo, "P", totem="Plan", check=has)["changed"] is True
    b = binding_of(repo)
    assert b["totem"] == "Plan"
    assert [s.name for s in plan_sections(b, sections(SCRIPT))] == ["1. Read", "2. Show"]
    assert len(plan_sections({"totem": None}, sections(SCRIPT))) == 3, "no totem named: every box"
    with pytest.raises(ValueError, match="pass replace"):
        bind(repo, "P", totem="Rules", check=has)


def test_a_folder_that_is_not_a_repository_is_refused(tmp_path):
    from automatu.binding import repo_key
    with pytest.raises(ValueError, match="not a git repository"):
        repo_key(str(tmp_path))


def test_a_renamed_plan_totem_stays_the_plan_by_its_lasting_id():
    from automatu.binding import plan_sections, plan_totem
    from automatu.sources.canvas import sections
    script = ('<Canvas name="C"><Totem id="tm-0000000001" name="Plan, renamed"><Area name="1. Read"/></Totem>'
              '<Totem id="tm-0000000002" name="Rules"><Area name="Code is truth"/></Totem></Canvas>')
    b = {"repo": "r", "canvas": "C", "totem": "Plan", "totem_id": "tm-0000000001"}
    assert plan_totem(b, script) == "Plan, renamed"
    assert [s.name for s in plan_sections(b, sections(script), script)] == ["1. Read"]
    assert plan_totem({**b, "totem_id": None}, script) == "Plan", "with no id it is found by its name, as before"
