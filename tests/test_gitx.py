from automatu.sources.gitx import Commit, without_trailers


def test_the_trailer_block_is_dropped():
    msg = "feat(x): a thing\n\nWhy it changed.\n\nGitX-Builds-On: abc1234\nGitX-Thoughts: t-0123456789\nCo-Authored-By: Someone <a@b.c>\n"
    assert without_trailers(msg) == "feat(x): a thing\n\nWhy it changed."


def test_a_message_with_no_trailers_is_kept_whole():
    assert without_trailers("fix: one line") == "fix: one line"
    assert without_trailers("fix: a\n\nBody: with a colon in prose, and more words") == "fix: a\n\nBody: with a colon in prose, and more words"


def test_gitx_links_in_a_paragraph_of_their_own_are_dropped_too():
    # how this project's commits were laid out from 8 to 11 Nov (t-f749bd4e09)
    msg = ("feat(x): a thing\n\nWhy it changed.\n\nGitX-Builds-On: abc1234\nGitX-Relates-To: def5678\n\n"
           "GitX-Thoughts: t-0123456789\nCo-Authored-By: Someone <a@b.c>\n")
    assert without_trailers(msg) == "feat(x): a thing\n\nWhy it changed."


def test_a_paragraph_with_prose_above_the_block_stays():
    msg = "feat: a\n\nWhy.\n\nNote: kept\nGitX-Builds-On: abc1234\n\nGitX-Thoughts: t-0123456789\nCo-Authored-By: X <x@y>"
    assert without_trailers(msg) == "feat: a\n\nWhy.\n\nNote: kept\nGitX-Builds-On: abc1234"


def test_gitx_lines_alone_above_prose_with_no_block_stay():
    msg = "feat: a\n\nGitX-Builds-On: abc1234\n\nAnd a closing sentence."
    assert without_trailers(msg) == msg


def test_a_last_paragraph_only_partly_trailers_stays():
    msg = "feat: a\n\nGitX-Root: X\nand a sentence"
    assert without_trailers(msg) == msg


def test_a_commit_reads_as_subject_then_body():
    assert Commit("abc", "2026-11-08", "feat: a", "why").text == "feat: a\n\nwhy"
    assert Commit("abc", "2026-11-08", "feat: a", "").text == "feat: a"
