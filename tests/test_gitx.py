from automatu.sources.gitx import Commit, without_trailers


def test_the_trailer_block_is_dropped():
    msg = "feat(x): a thing\n\nWhy it changed.\n\nGitX-Builds-On: abc1234\nGitX-Thoughts: t-0123456789\nCo-Authored-By: Someone <a@b.c>\n"
    assert without_trailers(msg) == "feat(x): a thing\n\nWhy it changed."


def test_a_message_with_no_trailers_is_kept_whole():
    assert without_trailers("fix: one line") == "fix: one line"
    assert without_trailers("fix: a\n\nBody: with a colon in prose, and more words") == "fix: a\n\nBody: with a colon in prose, and more words"


def test_a_last_paragraph_only_partly_trailers_stays():
    msg = "feat: a\n\nGitX-Root: X\nand a sentence"
    assert without_trailers(msg) == msg


def test_a_commit_reads_as_subject_then_body():
    assert Commit("abc", "2026-11-08", "feat: a", "why").text == "feat: a\n\nwhy"
    assert Commit("abc", "2026-11-08", "feat: a", "").text == "feat: a"
