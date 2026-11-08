"""Related neighbours: which boxes on a canvas belong together, and why
(t-5d0347338f).

Every box counts, whatever totem holds it (t-72d05843b2). Two boxes are related
by what they hold:

  meaning  their words, with the words of the boxes inside them, embedded
           locally as alignment does, and close enough: within one totem or
           sub-totem a weaker likeness is enough, across totems it has to be
           stronger, so a totem keeps its topics together unless the evidence
           says otherwise (t-3e803d4274);
  links    the user's links, read across totems (t-dbba56c17a);
  code     when both boxes have code placed under them, the code decides
           (t-78db7e6b75): a region under both, code under one using a name
           code under the other declares, or commits that changed code under
           both. Related in code is together, different in code is apart,
           whatever the canvas says (t-72d05843b2).

A commit behind a large share of a repository's regions and a region used from
a large share of the boxes are plumbing, not evidence - the way calibration
already leaves bulk commits out.

Nothing is kept here but the embeddings' cache; the answer is worked out when
asked and remembered for the same canvas script and the same maps.
"""
from __future__ import annotations

import hashlib
import re
import threading

import numpy as np

from .binding import all_bindings
from .embed import embed_cached, normalise
from .maps import latest_map
from .sources.canvas import canvas_links, read_canvas_raw, sections

# Starting numbers, checked by hand on the map (box 8's test) before any
# calibration: how far above the canvas's usual likeness two boxes must be.
BAR_IN = 1.0      # inside one totem or sub-totem: mean + 1.0 sd
BAR_OUT = 2.0     # across totems: mean + 2.0 sd
TOP_IN, TOP_OUT = 3, 2   # and each must be among the other's nearest few
BULK = 0.30       # a commit behind more than this share of the regions is no evidence
HUB = 0.5         # a region used from more than this share of the coded boxes is plumbing
MAX_TEXT = 6000
# Code keeps two boxes apart only when each has enough code placed under it to
# speak for it; any code relating them counts however little there is.
MIN_APART = 3
# A test using code checks it; it does not build on it, so it relates nothing.
TEST_FILE = re.compile(r"(^|/)tests?/|(^|/)test_[^/]*\.py$|_test\.py$|\.test\.[jt]sx?$")

_cache: dict[str, dict] = {}
_lock = threading.Lock()

_KIND = re.compile(r"\s*\((totem|sub-totem|note)\)\s*$")


def _segs(addr: str) -> list[str]:
    return addr.split(" > ")


def _plain(seg: str) -> str:
    return _KIND.sub("", seg).strip()


def owner_of(addr: str) -> str:
    """The totem or sub-totem a box sits in."""
    segs = _segs(addr)
    i = max(k for k, s in enumerate(segs) if s.endswith("(totem)") or s.endswith("(sub-totem)"))
    return " > ".join(segs[:i + 1])


def _under(a: str, b: str) -> bool:
    return a.startswith(b + " > ")


def resolve(end: str, totem: str, addrs: list[str]) -> str | None:
    """The box a link's end names: a path inside its own totem, or a whole
    address into another; a note's name leads to the box holding it."""
    absolute = end.split(">")[0].strip().endswith("(totem)")
    path = [_plain(s) for s in end.split(">") if s.strip()]

    def find(p: list[str]) -> str | None:
        if not p:
            return None
        hits = []
        for a in addrs:
            ps = [_plain(s) for s in _segs(a)]
            if absolute:
                if ps == p:
                    hits.append(a)
            elif ps[0] == totem and len(ps) > len(p) and ps[-len(p):] == p:
                hits.append(a)
        return min(hits, key=len) if hits else None

    return find(path) or find(path[:-1])


def _short(rid: str) -> str:
    """A region id as a reader says it: file name and the declaration's name."""
    file, _, name = rid.split("|", 1)[-1].partition("::")
    m = re.search(r"(?:def|class|function\*?|const|let|var)\s+([\w$]+)", name)
    return file.rsplit("/", 1)[-1] + " · " + (m.group(1) if m else name[:40])


def _code(canvas: str) -> tuple[dict[str, set[str]], dict[str, set[str]], list[tuple[str, str]], list[int]]:
    """Code placed under the canvas's boxes, from the newest map of every
    repository bound to it: box -> regions, region -> evidence commits, and the
    uses between regions. Region and commit ids carry their repository."""
    from .views import _repo  # read per HEAD, shared with the code view
    placed: dict[str, set[str]] = {}
    commits: dict[str, set[str]] = {}
    uses: list[tuple[str, str]] = []
    runs: list[int] = []
    for b in all_bindings():
        if b["canvas"] != canvas:
            continue
        m = latest_map(b["repo"])
        if not m:
            continue
        runs.append(m["run"]["id"])
        key = b["repo"] + "|"
        for p in m["places"]:
            for sec in (p["sections"] or ([p["section"]] if p["section"] else [])):
                placed.setdefault(sec, set()).add(key + p["region"])
        repo = _repo(b["repo"])
        count: dict[str, int] = {}
        for r in repo.regions:
            for sha, _ in r.commits:
                count[sha] = count.get(sha, 0) + 1
        bulk = {sha for sha, c in count.items() if c > BULK * max(1, len(repo.regions))}
        for r in repo.regions:
            commits[key + r.id] = {key + sha for sha, _ in r.commits if sha not in bulk}
        uses += [(key + x, key + y) for x, y in repo.uses if not TEST_FILE.search(x.split("::", 1)[0])]
    return placed, commits, uses, runs


def relations(canvas: str) -> dict:
    """Every pair of related boxes on a canvas, with why; and the pairs the
    code keeps apart although the canvas would put them together."""
    script = read_canvas_raw(canvas)["script"]
    placed, region_commits, uses, runs = _code(canvas)
    sig = hashlib.sha256((script + repr(sorted(runs))).encode("utf-8")).hexdigest()
    with _lock:
        hit = _cache.get(canvas)
        if hit and hit["sig"] == sig:
            return hit["out"]

    secs = sections(script)
    addrs = [s.address for s in secs]
    own = {s.address: s.words for s in secs}
    text = {a: "\n".join([own[a]] + [own[b] for b in addrs if _under(b, a)])[:MAX_TEXT] for a in addrs}
    owner = {a: owner_of(a) for a in addrs}
    n = len(addrs)
    pair_ok = np.array([[i != j and not _under(addrs[i], addrs[j]) and not _under(addrs[j], addrs[i])
                         for j in range(n)] for i in range(n)], dtype=bool) if n else np.zeros((0, 0), dtype=bool)

    # Meaning.
    note = ""
    sim = np.zeros((n, n), dtype=np.float32)
    meaning = False
    numbers = {}
    try:
        key = lambda a: "box:" + canvas + ":" + a
        vecs, _ = embed_cached([(key(a), text[a]) for a in addrs])
        dim = len(next(iter(vecs.values()))) if vecs else 0
        V = np.stack([normalise(vecs[key(a)]) if key(a) in vecs else np.zeros(dim, dtype=np.float32) for a in addrs]) if dim else None
        if V is not None:
            sim = V @ V.T
            vals = sim[pair_ok]
            if vals.size:
                mu, sd = float(vals.mean()), float(vals.std())
                numbers = {"mean": round(mu, 4), "sd": round(sd, 4),
                           "bar_in": round(mu + BAR_IN * sd, 4), "bar_out": round(mu + BAR_OUT * sd, 4)}
                meaning = True
    except Exception as e:  # no embedding server: links and code still relate boxes
        note = "Closeness in meaning is off: " + str(e)[:200]

    def nearest(i: int, same: bool) -> list[int]:
        cand = [j for j in range(n) if pair_ok[i, j] and (owner[addrs[j]] == owner[addrs[i]]) == same]
        return sorted(cand, key=lambda j: -sim[i, j])[:TOP_IN if same else TOP_OUT]

    near_in = [set(nearest(i, True)) for i in range(n)] if meaning else []
    near_out = [set(nearest(i, False)) for i in range(n)] if meaning else []

    def close(i: int, j: int) -> bool:
        if not meaning:
            return False
        same = owner[addrs[i]] == owner[addrs[j]]
        bar = numbers["bar_in"] if same else numbers["bar_out"]
        near = near_in if same else near_out
        return float(sim[i, j]) >= bar and j in near[i] and i in near[j]

    # Links.
    idx = {a: i for i, a in enumerate(addrs)}
    linked: set[tuple[int, int]] = set()
    for totem, f, t in canvas_links(script):
        a, b = resolve(f, totem, addrs), resolve(t, totem, addrs)
        if a and b and pair_ok[idx[a], idx[b]]:
            linked.add((min(idx[a], idx[b]), max(idx[a], idx[b])))

    # Code: a box holds what is placed under it and under the boxes inside it.
    code = {a: set().union(*[placed.get(b, set()) for b in addrs if b == a or _under(b, a)]) for a in addrs}
    coded = [a for a in addrs if placed.get(a)]
    users: dict[str, set[str]] = {}
    for x, y in uses:
        for a in coded:
            if x in placed[a]:
                users.setdefault(y, set()).add(a)
    hubs = {y for y, bs in users.items() if len(coded) >= 3 and len(bs) > HUB * len(coded)}
    uses = [(x, y) for x, y in uses if y not in hubs]
    box_commits = {a: set().union(*[region_commits.get(r, set()) for r in code[a]]) if code[a] else set() for a in addrs}

    def code_says(a: str, b: str) -> tuple[float, list[str]]:
        A, B = code[a], code[b]
        shared = A & B
        used = [(x, y) for x, y in uses if x not in shared and y not in shared and ((x in A and y in B) or (x in B and y in A))]
        co = box_commits[a] & box_commits[b]
        why = []
        if shared:
            why.append(f"the same code sits under both ({len(shared)}: {_short(next(iter(sorted(shared))))})")
        if used:
            x, y = used[0]
            why.append(f"code under one uses code under the other ({len(used)}: {_short(x)} uses {_short(y)})")
        if len(co) >= 2:
            why.append(f"{len(co)} commits changed code under both")
        return 2 * len(shared) + len(used) + 0.5 * len(co), why

    edges, apart = [], []
    for i in range(n):
        for j in range(i + 1, n):
            if not pair_ok[i, j]:
                continue
            a, b = addrs[i], addrs[j]
            is_link, is_close = (i, j) in linked, close(i, j)
            canvas_why = (["linked on the canvas"] if is_link else []) + ([f"close in meaning ({float(sim[i, j]):.2f})"] if is_close else [])
            cross = owner[a] != owner[b]
            score, why = code_says(a, b) if code[a] and code[b] else (0, [])
            if score >= 1:
                edges.append({"a": a, "b": b, "w": round(1 + score, 3), "by": "code", "cross": cross,
                              "why": why + canvas_why, "disagree": "" if canvas_why else "related in code, not on the canvas"})
            elif len(code[a]) >= MIN_APART and len(code[b]) >= MIN_APART:
                if canvas_why:
                    apart.append({"a": a, "b": b, "why": [f"both have code ({len(code[a])} and {len(code[b])} regions), and it is not related"],
                                  "disagree": "apart in code, though " + " and ".join(canvas_why)})
            elif canvas_why:
                edges.append({"a": a, "b": b, "w": round((1.0 if is_link else 0) + float(sim[i, j]), 4),
                              "by": "link" if is_link else "meaning", "cross": cross, "why": canvas_why, "disagree": ""})

    out = {"canvas": canvas, "meaning": meaning, "note": note, "numbers": numbers,
           "boxes": {a: {"owner": owner[a], "code": len(placed.get(a, ()))} for a in addrs},
           "edges": edges, "apart": apart}
    with _lock:
        _cache[canvas] = {"sig": sig, "out": out}
    return out
