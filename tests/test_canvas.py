from automatu.sources.canvas import parse_script, sections, without_ids

SCRIPT = """<Canvas name="Plan">
  <Totem name="Build" id="1" owner="agent">
    <Text>About the plan (t-0123456789).</Text>
    <Row>
      <Area name="1. Read" id="2">
        <Note name="Files">- read the files &amp; folders
- built in 28ffbad</Note>
        <Area name="Inner"><Text><![CDATA[a <b> c]]></Text></Area>
      </Area>
      <Area name="2. Show"><File path="C:\\x\\y.png"/></Area>
    </Row>
    <SubTotem name="Later"><Area name="3. Agents"><Note name="Todo">- [ ] maps</Note></Area></SubTotem>
  </Totem>
</Canvas>"""


def test_every_box_is_a_section_with_its_address():
    assert [s.address for s in sections(SCRIPT)] == [
        "Build (totem) > 1. Read",
        "Build (totem) > 1. Read > Inner",
        "Build (totem) > 2. Show",
        "Build (totem) > Later (sub-totem) > 3. Agents",
    ]


def test_a_sections_words_are_its_own_without_gitx_ids():
    read, inner, show, _ = sections(SCRIPT)
    assert "read the files & folders" in read.words
    assert "a <b> c" not in read.words, "a box inside is its own section"
    assert "28ffbad" not in read.words
    assert read.cites == ["28ffbad"]
    assert inner.words == "Inner\na <b> c"
    assert "y.png" in show.words
    assert read.totem == "Build"


def test_ids_come_out_with_their_brackets():
    words, cites = without_ids("Renamed to RAGX (c53557f, t-315b93a0a9): a reason.")
    assert words == "Renamed to RAGX: a reason."
    assert cites == ["t-315b93a0a9", "c53557f"]


def test_plain_words_that_look_like_hex_stay():
    assert without_ids("a decade of 2026-11-08 cafe")[0] == "a decade of 2026-11-08 cafe"


def test_the_tree_keeps_cdata_and_attributes():
    root = parse_script('<A x="1 &amp; 2"><![CDATA[<svg/>]]></A>')
    assert root.children[0].attrs["x"] == "1 & 2"
    assert root.children[0].text == "<svg/>"


def test_the_tree_keeps_totems_sub_totems_boxes_and_links():
    from automatu.sources.canvas import tree
    script = ('<Canvas name="P"><Totem name="Build" owner="agent"><Text>About.</Text>'
              '<Row><Area name="1. Read"><Note name="Files">- read</Note><Area name="Inner"/></Area><Area name="2. Show"/></Row>'
              '<SubTotem name="Later"><Area name="Agents"/></SubTotem><Link from="1. Read" to="2. Show"/></Totem></Canvas>')
    [t] = tree(script)
    assert (t["name"], t["owner"], t["text"]) == ("Build", "agent", "About.")
    assert [b["name"] for b in t["boxes"]] == ["1. Read", "2. Show"]
    assert t["boxes"][0]["items"][0]["name"] == "Files" and t["boxes"][0]["boxes"][0]["name"] == "Inner"
    assert t["subs"][0]["name"] == "Later" and t["subs"][0]["boxes"][0]["name"] == "Agents"
    assert t["links"] == [["1. Read", "2. Show"]]


def _workspace(tmp_path, monkeypatch, files, sources=None):
    import json
    from automatu.sources import canvas
    data = tmp_path / "notex"
    data.mkdir()
    (data / "config.json").write_text(json.dumps({"workspace": str(tmp_path / "ws")}))
    rt = tmp_path / "runtime.json"
    rt.write_text(json.dumps({"dataDir": str(data)}))
    monkeypatch.setattr(canvas, "NOTEX_RUNTIME", str(rt))
    fab = tmp_path / "ws" / "Plan"
    (fab / "sources").mkdir(parents=True)
    (fab / "fabric.json").write_text(json.dumps({"files": files}))
    for name, body in (sources or {}).items():
        (fab / "sources" / name).write_bytes(body)


def test_an_image_is_read_from_sources_or_from_its_data_url(tmp_path, monkeypatch):
    import base64
    from automatu.sources.canvas import canvas_files, canvas_image
    png = b"\x89PNG\r\n\x1a\nbody"
    _workspace(tmp_path, monkeypatch, [
        {"id": "a", "name": "flow.png", "isImage": True, "imageWidth": 480, "imageHeight": 720},
        {"id": "b", "name": "only-inside.png", "isImage": True, "imageDataUrl": "data:image/png;base64," + base64.b64encode(png).decode()},
        {"id": "c", "name": "notes.txt", "isImage": False},
        {"id": "d", "name": "../escape.png", "isImage": True},
    ], {"flow.png": png})
    assert canvas_files("Plan")["a"]["w"] == 480
    assert canvas_image("Plan", "a") == (png, "image/png")
    assert canvas_image("Plan", "b") == (png, "image/png")
    assert canvas_image("Plan", "c") is None, "not an image"
    assert canvas_image("Plan", "d") is None, "a name with a path never leaves sources/"
    assert canvas_image("Plan", "nope") is None


def test_an_image_an_agent_wrote_is_shown_from_its_name_as_a_hand_made_one_is_from_its_id(tmp_path, monkeypatch):
    """An agent canvas comes back as its scripts: a <File> there has only the
    path or name it was written with, no id and no kind - it is found on the
    canvas by its name. A hand-made canvas's file keeps coming by its id."""
    from automatu.sources.canvas import tree
    from automatu.views import _with_pictures
    _workspace(tmp_path, monkeypatch, [
        {"id": "f1", "name": "AutomatU design - Main.png", "isImage": True, "imageWidth": 480, "imageHeight": 300},
        {"id": "f2", "name": "notes.txt", "isImage": False},
        {"id": "f3", "name": "flow.png", "isImage": True},
    ])
    script = ('<Canvas name="Plan"><Totem name="Design"><Area name="Main">'
              '<File path="C:\\Users\\me\\scratch\\AutomatU design - Main.png"/>'
              '<File path="AutomatU design - Main.png"/>'
              '<File path="notes.txt"/>'
              '<File path="not-on-the-canvas.png"/>'
              '<File id="f3" kind="image" name="flow.png"/>'
              '</Area></Totem></Canvas>')
    totems = tree(script)
    _with_pictures("Plan", totems)
    full, short, text, missing, made = totems[0]["boxes"][0]["items"]
    assert full["name"] == "AutomatU design - Main", "a written path shows as its file's name"
    for it in (full, short):
        assert (it["id"], it["label"], it["ratio"]) == ("f1", "Image", "480 / 300")
        assert it["src"] == "/api/canvas-image?canvas=Plan&id=f1"
    assert text["id"] == "f2" and "src" not in text and text["label"] == "File", "a file that is not an image stays a file"
    assert missing["id"] == "" and "src" not in missing, "a name not on the canvas finds nothing"
    assert made["src"] == "/api/canvas-image?canvas=Plan&id=f3", "a hand-made canvas's image still comes by its id"


def test_a_canvas_name_cannot_walk_out_of_the_workspace(tmp_path, monkeypatch):
    import pytest
    from automatu.sources.canvas import canvas_files
    _workspace(tmp_path, monkeypatch, [])
    with pytest.raises(ValueError):
        canvas_files("../Plan")


def test_a_hex_citation_and_a_totem_id_are_kept_whole():
    # A totem id's hex part has a digit and a letter, like a commit hash: it was cut out,
    # leaving citations that point to no box (t-6408fcd85b).
    text = "- FastAPI and Pydantic [h:AutomatU/tm-a39e299aa1/14. Typed data] (8d3337b)\n- see totem tm-4d97673ded"
    words, cites = without_ids(text)
    assert "[h:AutomatU/tm-a39e299aa1/14. Typed data]" in words
    assert "tm-4d97673ded" in words
    assert cites == ["8d3337b"], "the totem ids are no commits"
    assert "8d3337b" not in words, "commit hashes still go beside the words"
