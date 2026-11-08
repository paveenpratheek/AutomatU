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
