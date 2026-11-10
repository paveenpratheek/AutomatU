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
    assert sorted(t.name for t in tools) == ["agents", "box", "find", "notices", "shelf", "since"]
    for t in tools:
        assert t.annotations.read_only_hint and not t.annotations.destructive_hint, t.name
        assert t.output_schema, f"{t.name} answers in a typed shape"


def test_a_hex_names_the_totem_by_its_lasting_id(monkeypatch):
    script = ('<Canvas name="C"><Totem id="tm-abc" name="Plan"><Area name="3. Map"><Note name="n">w</Note></Area></Totem>'
              '<Totem name="Notes"><Area name="Loose"><Note name="n">w</Note></Area></Totem></Canvas>')
    s = sections(script)
    h = context.hex_of("C", script, s[0])
    assert (h.ref, h.totem_id, h.totem, h.box) == ("h:C/tm-abc/3. Map", "tm-abc", "Plan", "3. Map")
    assert context.hex_of("C", script, s[1]).ref == "h:C/Notes/Loose", "a totem with no lasting id is named"


def test_the_shelf_gives_every_box_of_any_canvas_with_its_hex(monkeypatch):
    script = '<Canvas name="R"><Totem id="tm-r1" name="Skills"><Area name="Python"><Note name="n">Built APIs (t-0123456789)</Note></Area><Area name="SQL"><Note name="n">joins</Note></Area></Totem></Canvas>'
    monkeypatch.setattr(context, "read_canvas_script", lambda c: script)
    monkeypatch.setattr(context, "all_bindings", lambda: [])  # a canvas no repository is bound to
    a = context.shelf("R")
    assert [b.hex.ref for b in a.boxes] == ["h:R/tm-r1/Python", "h:R/tm-r1/SQL"]
    assert a.maps == [] and all(b.regions == [] and b.plans == [] for b in a.boxes)
    assert "Built APIs" in a.boxes[0].words
    with pytest.raises(ValueError, match="name a canvas"):
        context.shelf(" ")


def test_since_a_map_needs_a_map_that_exists(monkeypatch):
    class Row:
        def fetchone(self):
            return None

    class DB:
        def execute(self, *a):
            return Row()
    import automatu.store as store
    monkeypatch.setattr(store, "db", lambda: DB())
    with pytest.raises(ValueError, match="there is no map 7"):
        context.since(map=7)
    with pytest.raises(ValueError, match="a moment"):
        context.since()
