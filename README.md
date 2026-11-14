# AutomatU
[![CI](https://github.com/paveenpratheek/AutomatU/actions/workflows/ci.yml/badge.svg)](https://github.com/paveenpratheek/AutomatU/actions/workflows/ci.yml)

**Keeps a project's plan and its code lined up.** AutomatU reads a repository's
code regions with the commits and recorded decisions behind them (through
GitX), reads the canvas that plans the project (through NoteX), and places each
piece of code under the plan box it does - or leaves it waiting when the plan
has not caught up. It shows the result as hexagon maps: what was planned, what
was built where, and what was built that the plan does not explain yet.

## Where everything is explained

This README is only the front page. The plan, how every part works (algorithms,
architecture, tests, measurements, problems met and the commits that fixed
them) and the rules agents build it by all live on the **AutomatU canvas** in
File Fabric, read through NoteX:

- **AutomatU Build Plan** - the plan, box by box
- **AutomatU: how it works** - each built part explained, linked to its plan box
- **Rules and Criteria for Building Agents** - the workflow and the rules

The decisions behind the code are in this repository's GitX record, cited on
the canvas by id.

## Stack

Python 3.12 · PostgreSQL + pgvector (Docker) · psycopg 3 · numpy ·
FastAPI + uvicorn · Ollama (bge-m3, local) · pytest · a small Node bridge to
GitX · the map view in plain browser JavaScript.

## Running it

Needs Docker Desktop, Ollama with `bge-m3`, Node, a GitX checkout and NoteX
running.

```
docker compose up -d                       (or: docker start automatu-pg)
py -3.12 -m venv .venv
.venv\Scripts\pip install -e ".[dev]"

.venv\Scripts\automatu bind <repo> <canvas> --totem "<plan totem>"
.venv\Scripts\automatu align <repo>        make a map
.venv\Scripts\automatu serve               map view on http://127.0.0.1:7790

.venv\Scripts\python -m pytest             Python tests
node --test web/                           map view tests
```

Paths to GitX and NoteX default to this machine's and are set with `GITX_DIR`,
`NOTEX_RUNTIME`, `AUTOMATU_DB_URL` and `OLLAMA_URL`.

### Agents at the desks

The Agents button on a desk's hex places an agent at the desk: Antigravity
(`agy`) or Claude, on the model chosen, working in the project's folder. AutomatU
starts it with no app window over ACP and keeps it until it is detached or
AutomatU stops; its chat, its permission asks and its queue are on the hex, and
each desk's agent is an A2A agent at `http://127.0.0.1:7790/a2a/<desk>/` that
Work Desks' `ask_desk` reaches by the desk's name. It uses Work Desks' occupant,
guard and policy, so Work Desks is installed beside AutomatU:

```
.venv\Scripts\pip install -e "<Project WorkDesk folder>"
```

Each agent keeps its folder under `AUTOMATU_DESK_AGENTS`
(default `E:\ter-manager\plugins\automatu\desk-agents`).

## License

Copyright (C) 2026 Paveen Pratheek.
AutomatU is free software under the **GNU Affero General Public License v3 or later**. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The name "AutomatU" is not licensed for use by modified versions.
