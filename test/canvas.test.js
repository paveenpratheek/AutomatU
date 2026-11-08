import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, sections, withoutIds } from '../src/sources/canvas.js';

const SCRIPT = `<Canvas name="Plan">
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
</Canvas>`;

test('every box is a section with its address', () => {
  const s = sections(SCRIPT);
  assert.deepEqual(s.map((x) => x.address), [
    'Build (totem) > 1. Read',
    'Build (totem) > 1. Read > Inner',
    'Build (totem) > 2. Show',
    'Build (totem) > Later (sub-totem) > 3. Agents',
  ]);
});

test("a section's words are its own, without GitX ids", () => {
  const [read, inner, show] = sections(SCRIPT);
  assert.match(read.words, /read the files & folders/);
  assert.doesNotMatch(read.words, /a <b> c/, 'a box inside is its own section');
  assert.doesNotMatch(read.words, /28ffbad/);
  assert.deepEqual(read.cites, ['28ffbad']);
  assert.equal(inner.words, 'Inner\na <b> c');
  assert.match(show.words, /y\.png/);
});

test('thought ids and commit hashes come out, and their brackets with them', () => {
  const r = withoutIds('Renamed to RAGX (c53557f, t-315b93a0a9): a reason.');
  assert.equal(r.words, 'Renamed to RAGX: a reason.');
  assert.deepEqual(r.cites, ['t-315b93a0a9', 'c53557f']);
});

test('plain words that look a little like hex stay', () => {
  assert.equal(withoutIds('a decade of 2026-11-08 cafe').words, 'a decade of 2026-11-08 cafe');
});

test('the tree keeps CDATA and attributes', () => {
  const root = parseScript('<A x="1 &amp; 2"><![CDATA[<svg/>]]></A>');
  assert.equal(root.children[0].attrs.x, '1 & 2');
  assert.equal(root.children[0].text, '<svg/>');
});
