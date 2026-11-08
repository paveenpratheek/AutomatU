/*
 * Reads a File Fabric canvas through NoteX's running engine and turns it into
 * the plan's sections: every box (Area) with its address and its own words -
 * its name and the notes, texts and files directly inside it. A box inside a
 * box is a section of its own (t-7c9635839c).
 *
 * Read when asked, never copied. The engine's address and token are taken
 * from NoteX's runtime file at each call and never stored (t-8c6a4dcf47).
 */
import fs from 'node:fs';

export const NOTEX_RUNTIME = process.env.NOTEX_RUNTIME || 'E:/Coding CLI/Project NoteX/plugin/runtime.json';

function runtime() {
  try { return JSON.parse(fs.readFileSync(NOTEX_RUNTIME, 'utf8')); } catch (_) { return null; }
}

/* The canvas as its totem script, the same text notex_read gives an agent. */
export async function readCanvasScript(name) {
  const rt = runtime();
  if (!rt) throw new Error("NoteX's engine is not running: open NoteX in ter-manager and start it.");
  const res = await fetch(rt.url + '/api/fabrics/' + encodeURIComponent(name) + '/script', {
    headers: { 'x-notex-token': rt.token }, signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || 'NoteX answered ' + res.status);
  return data.script;
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/* The script as a tree of { tag, attrs, text, children }. Tags are NoteX's
   own (Canvas, Totem, SubTotem, Row, Column, Area, Note, Text, File, Link,
   Image, ScrollBox, Page); anything else is kept the same way. */
export function parseScript(script) {
  const root = { tag: 'Root', attrs: {}, text: '', children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:-]+="[^"]*")*)\s*(\/?)>/g;
  let at = 0, m;
  const addText = (s) => { if (s) stack[stack.length - 1].text += unescape(s); };
  while ((m = re.exec(script))) {
    addText(script.slice(at, m.index));
    at = re.lastIndex;
    if (m[1] !== undefined) { stack[stack.length - 1].text += m[1]; continue; }
    if (!m[3]) continue; /* a comment */
    const [, , close, tag, rawAttrs, selfClose] = m;
    if (close) {
      /* Close back to the matching open tag; a stray close is ignored. */
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([A-Za-z_:-]+)="([^"]*)"/g)) attrs[a[1]] = unescape(a[2]);
    const node = { tag, attrs, text: '', children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  addText(script.slice(at));
  return root;
}

/* GitX ids written on a canvas - thought ids and commit hashes. They are
   taken out of a section's words and given beside them, so alignment is
   judged by what the plan says, never by an id that names the answer
   (t-71b7c1ee34). */
const THOUGHT_ID = /\bt-[0-9a-f]{10}\b/g;
const COMMIT_ID = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;

export function withoutIds(text) {
  /* Thought ids first: the hex inside a thought id would read as a commit
     hash (t-d7f5f0b312). */
  const noThoughts = text.replace(THOUGHT_ID, '');
  const cites = [...new Set([...(text.match(THOUGHT_ID) || []), ...(noThoughts.match(COMMIT_ID) || [])])];
  const words = noThoughts.replace(COMMIT_ID, '')
    .replace(/\(\s*[,;\s]*\)/g, '').replace(/[ \t]+([,.;:)])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  return { words, cites };
}

const clean = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/* Every box on the canvas as a section. */
export function sections(script) {
  const out = [];
  const walk = (node, trail, totem) => {
    for (const c of node.children) {
      if (c.tag === 'Totem') { walk(c, [c.attrs.name + ' (totem)'], c.attrs.name); continue; }
      if (c.tag === 'SubTotem') { walk(c, [...trail, c.attrs.name + ' (sub-totem)'], totem); continue; }
      if (c.tag === 'Area') {
        const address = [...trail, c.attrs.name].join(' > ');
        const own = [c.attrs.name];
        for (const k of c.children) {
          if (k.tag === 'Note') own.push((k.attrs.name ? k.attrs.name + ': ' : '') + clean(k.text));
          else if (k.tag === 'Text') own.push(clean(k.text));
          else if (k.tag === 'File') own.push(k.attrs.path || k.attrs.name || '');
          else if (k.tag === 'Row' || k.tag === 'Column') {
            /* Layout only: what a row inside a box holds is still the box's own. */
            for (const g of k.children) if (g.tag === 'Note' || g.tag === 'Text') own.push((g.attrs.name ? g.attrs.name + ': ' : '') + clean(g.text));
          }
        }
        const { words, cites } = withoutIds(own.filter(Boolean).join('\n'));
        out.push({ address, totem, name: c.attrs.name, words, cites });
        walk(c, [...trail, c.attrs.name], totem);
        continue;
      }
      walk(c, trail, totem); /* Canvas, Row, Column: layout, not a place */
    }
  };
  walk(parseScript(script), [], null);
  return out;
}

export async function readCanvas(name) {
  const script = await readCanvasScript(name);
  return { name, sections: sections(script) };
}
