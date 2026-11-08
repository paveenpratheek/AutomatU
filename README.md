# AutomatU

**Keeps a project's plan and its code lined up.** AutomatU reads a repository's
code regions with the commits and recorded decisions behind them, reads the
canvas that plans the project, and places each piece of code under the plan
section it belongs to - or leaves it waiting when the plan has not caught up.
The result is a map you can look at: what was planned, what was built where,
and what was built that the plan does not explain yet.

It is the first slice of a larger idea: one place where coding agents and
their user meet, with context brought together from where it already lives
instead of copied.

## How it works

```
 Canvas (the plan)     boxes of the plan totem, read through NoteX
        |
        |  placement = the only link AutomatU keeps
        |
 Code region           a function or block at HEAD, as GitX names it
 Commits               the commits whose lines are still in it (git blame)
 Thoughts              decisions recorded with those commits (GitX)
```

1. **Read, never copy.** Code regions, commits and decisions come from the
   repository's GitX record; plan sections come from the canvas. Nothing is
   stored except what AutomatU makes itself.
2. **Judge code by what was said about it.** Each commit message, decision
   and plan section is embedded locally (bge-m3 on Ollama). A region's vector
   mixes its commits, weighted by how many of its lines each still holds,
   with its live decisions - rejected or superseded ones are left out.
3. **Code is truth.** A region goes under a section only when it matches
   clearly: a strong score, well ahead of the next section. A region doing
   several topics sits in each of them, like a Venn overlap. Anything else
   waits, shown next to the section it would join - the plan never pulls
   code to itself.
4. **Every map is a snapshot,** with the commit and the numbers it was made
   with, so it reads the same later.

## Measured

The placement numbers are calibrated on a canvas whose links are already
known - the Harness canvas, whose boxes cite the commits and decisions of
RAGX and NoteX - with those citations hidden from AutomatU. Each repository
is checked against its own plan totem, as a binding places code. (CanvasX,
also on that canvas, is left out: its canvas does not hold its whole plan,
and its history was recorded after it was built without git.)

| RAGX + NoteX, 1,131 known regions | Nearest section right | Placed right (precision) | Known regions placed right (coverage) |
|---|---|---|---|
| One section per region | 73.8% | 98.5% | 41.8% |
| Shared (Venn) placement - kept | 73.8% | **91.9%** | **49.9%** |

AutomatU is also built under its own plan, and a key kept outside the
repository records which section each commit was built for. Its runs on its
own code so far, each against a pass mark fixed beforehand:

| Run | Precision | Coverage | Result |
|---|---|---|---|
| Whole canvas as candidates | 73.2% | 61.7% | fail - a rules totem drew code |
| Plan totem only (after the change) | 78.6% | 66.4% | not a fair test |
| Port to Python | 100% | 27.9% | fail - port commits describe the move, not the code |
| Port to Python, RAGX + NoteX numbers | 100% | 28.6% | fail on coverage; nearest section right for 86% |

What it shows: when AutomatU places code it is almost always right, and it
leaves code waiting rather than guess. Coverage depends on what was said
about the code - a commit that describes what the code does places well; a
bulk import or a "moved to Python" commit leaves too little to go on.

## Stack

Python 3.12 · PostgreSQL + pgvector (Docker) · psycopg 3 · numpy ·
FastAPI + uvicorn · Ollama (bge-m3, local, no API key) · pytest. GitX, the
code-history tool it reads, is written in Node, so a small Node bridge asks
GitX for its regions and hands Python JSON.

```
automatu/
  sources/gitx.py      regions, commits and decisions from GitX
  sources/canvas.py    plan sections from a canvas, through NoteX
  gitx_bridge.mjs      the Node bridge to GitX's region splitter
  binding.py           which canvas and plan totem a repository belongs to
  embed.py             local embeddings, cached in pgvector by text hash
  profile.py           a region's and a section's vectors
  align.py             placement: clear match, Venn overlap, or waiting
  maps.py              map snapshots
  calibrate.py         the grid search for the placement numbers
  serve.py             the map view's API
  cli.py               the automatu command
web/                   the map view (hexagon clusters, filter, waiting list)
migrations/            the store's schema, applied once each in order
```

## Running it

Needs Docker, Ollama with `bge-m3`, Node (for the GitX bridge), a GitX
checkout and NoteX running.

```
docker compose up -d
py -3.12 -m venv .venv
.venv\Scripts\pip install -e ".[dev]"

.venv\Scripts\automatu bind <repo> <canvas> --totem "<plan totem>"
.venv\Scripts\automatu sources <repo>        what it reads
.venv\Scripts\automatu align <repo>          make a map
.venv\Scripts\automatu serve                 map view on http://127.0.0.1:7790
.venv\Scripts\automatu calibrate             re-run calibration (--write to save)

.venv\Scripts\python -m pytest               tests (on their own database)
node --test web/layout.test.js               the map layout's test
```

Paths to GitX and NoteX default to this machine's and are set with
`GITX_DIR`, `NOTEX_RUNTIME`, `AUTOMATU_DB_URL` and `OLLAMA_URL`.
