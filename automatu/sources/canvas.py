"""Reads a File Fabric canvas through NoteX's running engine and turns it into
the plan's sections: every box (Area) with its address and its own words - its
name and the notes, texts and files directly inside it. A box inside a box is a
section of its own (t-7c9635839c).

Read when asked, never copied. The engine's address and token are taken from
NoteX's runtime file at each call and never stored (t-8c6a4dcf47).
"""
from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

NOTEX_RUNTIME = os.environ.get("NOTEX_RUNTIME", "E:/Coding CLI/Project NoteX/plugin/runtime.json")


@dataclass
class Section:
    address: str
    totem: str | None
    name: str
    words: str
    cites: list[str] = field(default_factory=list)


@dataclass
class Canvas:
    name: str
    sections: list[Section]


def read_canvas_script(name: str) -> str:
    """The canvas as its totem script, the same text notex_read gives an agent."""
    return read_canvas_raw(name)["script"]


def read_canvas_raw(name: str) -> dict:
    """NoteX's answer for a canvas: its script, and whether it is an agent canvas."""
    try:
        with open(NOTEX_RUNTIME, encoding="utf-8") as f:
            rt = json.load(f)
    except (OSError, ValueError):
        raise RuntimeError("NoteX's engine is not running: open NoteX in ter-manager and start it.")
    req = urllib.request.Request(rt["url"] + "/api/fabrics/" + urllib.parse.quote(name, safe="") + "/script",
                                 headers={"x-notex-token": rt["token"]})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            j = json.loads(res.read().decode("utf-8"))
            return {"script": j["script"], "agent": bool(j.get("agent"))}
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error", {}).get("message")
        except ValueError:
            msg = None
        raise RuntimeError(msg or "NoteX answered " + str(e.code))
    except urllib.error.URLError:
        raise RuntimeError("NoteX's engine is not running: open NoteX in ter-manager and start it.")


@dataclass
class Node:
    tag: str
    attrs: dict
    text: str = ""
    children: list["Node"] = field(default_factory=list)


_TOKEN = re.compile(r"<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<(/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:-]+=\"[^\"]*\")*)\s*(/?)>")
_ATTR = re.compile(r"([A-Za-z_:-]+)=\"([^\"]*)\"")


def parse_script(script: str) -> Node:
    """The script as a tree of nodes. Tags are NoteX's own (Canvas, Totem,
    SubTotem, Row, Column, Area, Note, Text, File, Link, Image, ScrollBox, Page)."""
    root = Node("Root", {})
    stack = [root]
    at = 0
    for m in _TOKEN.finditer(script):
        stack[-1].text += html.unescape(script[at:m.start()])
        at = m.end()
        if m.group(1) is not None:
            stack[-1].text += m.group(1)
            continue
        if not m.group(3):
            continue  # a comment
        close, tag, raw, self_close = m.group(2), m.group(3), m.group(4), m.group(5)
        if close:
            # Close back to the matching open tag; a stray close is ignored.
            tags = [n.tag for n in stack]
            if tag in tags[1:]:
                del stack[len(tags) - 1 - tags[::-1].index(tag):]
            continue
        node = Node(tag, {k: html.unescape(v) for k, v in _ATTR.findall(raw)})
        stack[-1].children.append(node)
        if not self_close:
            stack.append(node)
    stack[-1].text += html.unescape(script[at:])
    return root


# GitX ids written on a canvas - thought ids and commit hashes - are taken out of
# a section's words and given beside them, so alignment is judged by what the
# plan says, never by an id that names the answer (t-71b7c1ee34).
_THOUGHT_ID = re.compile(r"\bt-[0-9a-f]{10}\b")
_COMMIT_ID = re.compile(r"\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b")


def without_ids(text: str) -> tuple[str, list[str]]:
    # Thought ids first: the hex inside a thought id would read as a commit hash (t-d7f5f0b312).
    no_thoughts = _THOUGHT_ID.sub("", text)
    cites = list(dict.fromkeys(_THOUGHT_ID.findall(text) + _COMMIT_ID.findall(no_thoughts)))
    words = _COMMIT_ID.sub("", no_thoughts)
    words = re.sub(r"\(\s*[,;\s]*\)", "", words)
    words = re.sub(r"[ \t]+([,.;:)])", r"\1", words)
    words = re.sub(r"[ \t]{2,}", " ", words).strip()
    return words, cites


def _clean(s: str) -> str:
    s = "\n".join(l.strip() for l in s.replace("\r\n", "\n").split("\n"))
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def _note_text(n: Node) -> str:
    return (n.attrs["name"] + ": " if n.attrs.get("name") else "") + _clean(n.text)


def sections(script: str) -> list[Section]:
    """Every box on the canvas as a section."""
    out: list[Section] = []

    def walk(node: Node, trail: list[str], totem: str | None) -> None:
        for c in node.children:
            if c.tag == "Totem":
                walk(c, [c.attrs.get("name", "") + " (totem)"], c.attrs.get("name"))
            elif c.tag == "SubTotem":
                walk(c, trail + [c.attrs.get("name", "") + " (sub-totem)"], totem)
            elif c.tag == "Area":
                name = c.attrs.get("name", "")
                own = [name]
                for k in c.children:
                    if k.tag in ("Note", "Text"):
                        own.append(_note_text(k))
                    elif k.tag == "File":
                        own.append(k.attrs.get("path") or k.attrs.get("name") or "")
                    elif k.tag in ("Row", "Column"):
                        # Layout only: what a row inside a box holds is still the box's own.
                        own += [_note_text(g) for g in k.children if g.tag in ("Note", "Text")]
                words, cites = without_ids("\n".join(x for x in own if x))
                out.append(Section(address=" > ".join(trail + [name]), totem=totem, name=name, words=words, cites=cites))
                walk(c, trail + [name], totem)
            else:
                walk(c, trail, totem)  # Canvas, Row, Column: layout, not a place

    walk(parse_script(script), [], None)
    return out


def read_canvas(name: str) -> Canvas:
    return Canvas(name=name, sections=sections(read_canvas_script(name)))


def tree(script: str) -> list[dict]:
    """The canvas as the map view walks it: totems, their sub-totems and boxes,
    boxes inside boxes, and the notes, texts and files on each - with the links
    each totem draws between its boxes, as written ("Box > Note")."""
    def item(n: Node) -> dict:
        edited = n.attrs.get("edited") == "by the user" or n.attrs.get("owner") == "user"
        if n.tag == "File":
            path = n.attrs.get("path") or n.attrs.get("name") or ""
            return {"type": "file", "label": "Image" if n.attrs.get("kind") == "image" else "File",
                    "name": re.sub(r"\.png$", "", path, flags=re.I), "text": "", "edited": edited}
        return {"type": n.tag.lower(), "label": n.tag, "name": n.attrs.get("name", "") if n.tag == "Note" else "",
                "text": _clean(n.text), "edited": edited}

    def fill(node: Node, owner: dict, links: list) -> None:
        for c in node.children:
            if c.tag == "Area":
                box = {"kind": "box", "name": c.attrs.get("name", ""), "items": [], "boxes": []}
                owner["boxes"].append(box)
                fill(c, box, links)
            elif c.tag == "SubTotem" and owner["kind"] == "totem":
                sub = {"kind": "sub", "name": c.attrs.get("name", ""), "text": "", "items": [], "boxes": []}
                owner["subs"].append(sub)
                fill(c, sub, links)
            elif c.tag in ("Note", "Text", "File"):
                it = item(c)
                if owner["kind"] in ("totem", "sub") and c.tag == "Text":
                    owner["text"] = (owner["text"] + "\n\n" if owner["text"] else "") + it["text"]
                else:
                    owner["items"].append(it)
            elif c.tag == "Link":
                links.append([c.attrs.get("from", ""), c.attrs.get("to", "")])
            else:
                fill(c, owner, links)  # Row, Column: layout only

    out = []
    for t in _all(parse_script(script), "Totem"):
        totem = {"kind": "totem", "name": t.attrs.get("name", ""), "owner": t.attrs.get("owner", ""),
                 "text": "", "items": [], "boxes": [], "subs": [], "links": []}
        fill(t, totem, totem["links"])
        out.append(totem)
    return out


def _all(node: Node, tag: str) -> list[Node]:
    found = []
    for c in node.children:
        if c.tag == tag:
            found.append(c)
        else:
            found += _all(c, tag)
    return found
