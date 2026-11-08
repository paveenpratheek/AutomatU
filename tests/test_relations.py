import numpy as np

from automatu import relations as R

SCRIPT = """<Canvas name="K">
  <Totem name="T">
    <Area name="A"><Note name="Plan">the reader</Note></Area>
    <Area name="B"><Note name="Plan">the writer</Note></Area>
    <Area name="C"><Note name="Plan">the reader again</Note></Area>
    <Area name="D"><Note name="Plan">the store</Note></Area>
    <Link from="A > Plan" to="B"/>
  </Totem>
  <Totem name="U">
    <Area name="E"><Note name="Why">why the reader</Note></Area>
    <Link from="E" to="T (totem) > D"/>
  </Totem>
</Canvas>"""

E = np.eye(8, dtype=np.float32)
VECS = {"A": E[1], "B": E[3], "C": E[1] + 0.05 * E[2], "D": E[4], "E": E[1] + 0.3 * E[5]}


def _fake(monkeypatch, placed):
    monkeypatch.setattr(R, "read_canvas_raw", lambda name: {"script": SCRIPT, "agent": True})
    monkeypatch.setattr(R, "_code", lambda canvas: (placed, {}, [], [1]))
    monkeypatch.setattr(R, "embed_cached", lambda items: ({k: VECS[k.rsplit(" > ", 1)[-1]] for k, _ in items}, 0))
    R._cache.clear()


def addr(t, b):
    return f"{t} (totem) > {b}"


def test_links_resolve_through_a_note_and_across_totems():
    addrs = [addr("T", x) for x in "ABCD"] + [addr("U", "E")]
    assert R.resolve("A > Plan", "T", addrs) == addr("T", "A")
    assert R.resolve("T (totem) > D", "U", addrs) == addr("T", "D")
    assert R.owner_of("T (totem) > Later (sub-totem) > X > Y") == "T (totem) > Later (sub-totem)"


def test_close_in_meaning_inside_a_totem_but_a_stronger_bar_across_totems(monkeypatch):
    _fake(monkeypatch, {})
    out = R.relations("K")
    pairs = {(e["a"].split(" > ")[-1], e["b"].split(" > ")[-1]): e for e in out["edges"]}
    assert pairs[("A", "C")]["by"] == "meaning"
    assert ("A", "E") not in pairs, "a likeness enough inside a totem is not enough across totems"
    assert pairs[("A", "B")]["by"] == "link" and pairs[("D", "E")]["cross"]


def test_code_relates_however_little_but_keeps_apart_only_with_enough_code(monkeypatch):
    placed = {addr("T", "A"): {"r1", "r2", "r3"}, addr("T", "B"): {"r4", "r5", "r6"},
              addr("T", "C"): {"r7"}, addr("T", "D"): {"r7"}}
    _fake(monkeypatch, placed)
    out = R.relations("K")
    pairs = {(e["a"].split(" > ")[-1], e["b"].split(" > ")[-1]): e for e in out["edges"]}
    assert pairs[("C", "D")]["by"] == "code" and pairs[("C", "D")]["disagree"] == "related in code, not on the canvas"
    assert ("A", "B") not in pairs
    assert [(e["a"][-1], e["b"][-1], e["disagree"]) for e in out["apart"]] == [("A", "B", "apart in code, though linked on the canvas")]
    # One region under A and one under C: too little to keep them apart, so their likeness stands.
    _fake(monkeypatch, {addr("T", "A"): {"r1"}, addr("T", "C"): {"r2"}})
    out = R.relations("K")
    assert any(e["a"].endswith("A") and e["b"].endswith("C") and e["by"] == "meaning" for e in out["edges"])
