"""Reads a repository's GitX record as AutomatU needs it: every code region at
HEAD, the commits whose lines are still in it, and the thoughts linked to those
commits or cited in its comments.

Read when asked, never copied: what comes back lives only in memory, and the
region's own code text is not returned at all - a region is judged by its
commit messages and thoughts, not by its lines (t-b9795a5188).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

GITX_DIR = os.environ.get("GITX_DIR", "E:/Coding CLI/Project GitX")
BRIDGE = Path(__file__).resolve().parent.parent / "gitx_bridge.mjs"

# Agent workflow scaffolding, not the project's own code or docs.
SCAFFOLD = re.compile(r"^(\.claude|\.agents|\.agent)/|^(AGENTS|CLAUDE|GEMINI)\.md$")
TRAILER = re.compile(r"^[A-Za-z][A-Za-z0-9-]*: \S")
HYPHENATED_KEY = re.compile(r"^[A-Za-z0-9]+-[A-Za-z0-9-]*:")


@dataclass
class Commit:
    sha: str
    date: str
    subject: str
    body: str

    @property
    def text(self) -> str:
        return (self.subject + ("\n\n" + self.body if self.body else "")).strip()


@dataclass
class Thought:
    id: str
    graph: str  # "settled" (.gitx/thoughts) or "waiting" (.gitx/context/thoughts)
    kind: str | None
    outcome: str | None
    text: str
    commit: str  # the commit it was recorded at
    resulted: str  # the commit that settled it
    links: list[dict] = field(default_factory=list)


@dataclass
class Region:
    id: str
    file: str
    name: str
    kind: str | None
    start: int
    end: int
    commits: list[tuple[str, int]]  # (sha, lines still in the region), most lines first
    thoughts: list[str]


@dataclass
class Repo:
    dir: str
    head: str
    regions: list[Region]
    commits: dict[str, Commit]
    thoughts: dict[str, Thought]


def _git(dir: str, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=dir, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def without_trailers(message: str) -> str:
    """A commit message without its trailer block. Trailers are bookkeeping for
    the commit graph; AutomatU never reads them, so a repository made on its own
    (which has none) is judged the same way as one built here (t-38c7aa4f42).

    The last paragraph counts as trailers only when every line is "Key: value"
    and at least one key is hyphenated as real trailers are (GitX-Thoughts,
    Co-Authored-By) - so a closing line of prose such as "Note: ..." is kept
    (t-40ab23ab7b)."""
    paras = re.split(r"\n\s*\n", (message or "").replace("\r\n", "\n").strip())
    lines = [l.strip() for l in paras[-1].split("\n") if l.strip()]
    is_block = bool(lines) and all(TRAILER.match(l) for l in lines) and any(HYPHENATED_KEY.match(l) for l in lines)
    if len(paras) > 1 and is_block:
        paras.pop()
    return "\n\n".join(paras).strip()


def read_commits(dir: str) -> dict[str, Commit]:
    """Every commit reachable from HEAD: short sha -> subject and body, trailers removed."""
    out: dict[str, Commit] = {}
    for rec in _git(dir, "log", "--format=%H%x1f%as%x1f%B%x1e").split("\x1e"):
        parts = rec.lstrip().split("\x1f")
        if len(parts) < 3 or not parts[0] or not parts[2]:
            continue
        sha, date, body = parts[0], parts[1], parts[2]
        msg = without_trailers(body)
        subject, _, rest = msg.partition("\n")
        out[sha[:12]] = Commit(sha=sha[:12], date=date, subject=subject, body=rest.strip())
    return out


def read_thoughts(dir: str) -> dict[str, Thought]:
    """Every thought on record, from both graphs, with its status, so whoever
    reads a thought can tell a settled decision from a rejected or superseded one."""
    out: dict[str, Thought] = {}
    for store, graph in (("thoughts", "settled"), (os.path.join("context", "thoughts"), "waiting")):
        folder = Path(dir) / ".gitx" / store
        if not folder.is_dir():
            continue
        for f in folder.glob("*.json"):
            try:
                j = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if not isinstance(j, dict) or not j.get("id"):
                continue
            links = [{"type": l.get("type"), "to": l["to"]} for l in (j.get("links") or []) if isinstance(l, dict) and l.get("to")]
            out[j["id"]] = Thought(
                id=j["id"], graph=graph, kind=j.get("kind"), outcome=j.get("outcome"), text=j.get("text") or "",
                commit=((j.get("anchor") or {}).get("commit") or "")[:12],
                resulted=((j.get("resulted_in") or {}).get("commit") or "")[:12],
                links=links,
            )
    return out


def gitx_regions(dir: str) -> list[dict]:
    """GitX's own regions at HEAD, through the Node bridge (t-3dc4ff4d62)."""
    res = subprocess.run(["node", str(BRIDGE), dir, GITX_DIR], capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError("GitX could not read the regions of " + dir + ": " + res.stderr.strip()[-500:])
    return json.loads(res.stdout)["regions"]


def read_repo(dir: str) -> Repo:
    """The whole read: regions at HEAD, each with its live commits (most lines
    first) and its linked thoughts, plus the commits and thoughts they name."""
    head = _git(dir, "rev-parse", "HEAD").strip()[:12]
    commits = read_commits(dir)
    thoughts = read_thoughts(dir)

    # A thought is linked to a commit when it was settled by it or recorded at it.
    by_commit: dict[str, list[str]] = {}
    for t in thoughts.values():
        for c in {t.resulted, t.commit} - {""}:
            by_commit.setdefault(c, []).append(t.id)

    regions: list[Region] = []
    for r in gitx_regions(dir):
        if SCAFFOLD.search(r["file"]):
            continue
        live = sorted(((sha[:12], n) for sha, n in r["commits"].items()), key=lambda x: -x[1])
        live = [(sha, n) for sha, n in live if sha in commits]
        cited = [t for t in r["cites"] if t in thoughts]
        via_commit = [t for sha, _ in live for t in by_commit.get(sha, [])]
        regions.append(Region(
            id=r["file"] + "::" + r["name"], file=r["file"], name=r["name"], kind=r.get("kind"),
            start=r["from"], end=r["to"], commits=live, thoughts=list(dict.fromkeys(cited + via_commit)),
        ))
    return Repo(dir=dir, head=head, regions=regions, commits=commits, thoughts=thoughts)
