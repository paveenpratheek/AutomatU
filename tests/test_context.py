"""What an agent can ask (t-5fece0836c): boxes and repositories found by the
names an agent would use, and every tool of the MCP server only reads."""
import asyncio

import pytest

from automatu import context
from automatu.sources.canvas import sections


def secs():
    body = "".join(f'<Area name="{n}"><Note name="n">words of {n}</Note></Area>'
                   for n in ("12. The plan in time", "13. Notices and agents", "14. Typed data", "Test by hand"))
    return sections(f'<Canvas name="C"><Totem name="P">{body}</Totem></Canvas>')


def test_a_box_is_found_by_address_name_number_or_a_word_only_it_has():
    s = secs()
    assert context.match_box(s, "P (totem) > 14. Typed data").name == "14. Typed data"
    assert context.match_box(s, "13. notices and agents").name == "13. Notices and agents", "any case"
    assert context.match_box(s, "13").name == "13. Notices and agents", "a box's number"
    assert context.match_box(s, "typed").name == "14. Typed data", "a word only it holds"
    with pytest.raises(ValueError, match="no box called"):
        context.match_box(s, "nothing like it")
    with pytest.raises(ValueError, match="could be any of"):
        context.match_box(s, "t")  # in several names: say which, never guess


def test_a_repository_is_named_by_its_folder_or_path(monkeypatch):
    monkeypatch.setattr(context, "all_bindings", lambda: [{"repo": "E:/Coding CLI/Project AutomatU", "canvas": "AutomatU"}])
    assert context.resolve_repo("project automatu") == "E:/Coding CLI/Project AutomatU"
    assert context.resolve_repo("E:\\Coding CLI\\Project AutomatU\\") == "E:/Coding CLI/Project AutomatU"
    assert context.resolve_repo(None) is None
    with pytest.raises(ValueError, match="bound: Project AutomatU"):
        context.resolve_repo("Nope")


def test_every_tool_of_the_mcp_server_only_reads_and_answers_in_a_typed_shape():
    from automatu.mcp_server import server
    tools = asyncio.run(server.list_tools())
    assert sorted(t.name for t in tools) == ["agents", "box", "find", "notices", "since"]
    for t in tools:
        assert t.annotations.read_only_hint and not t.annotations.destructive_hint, t.name
        assert t.output_schema, f"{t.name} answers in a typed shape"
