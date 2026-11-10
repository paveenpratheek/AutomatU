"""AutomatU's MCP server (t-5fece0836c): agents in the Claude app, in Gemini's
agy, or anywhere MCP is spoken, ask AutomatU for context on the same shared,
arranged memory. Over stdio; started with `automatu mcp`.

Every tool only reads (t-ae4cb0d0a9): AutomatU answers, and the agent writes
what it decides through NoteX and GitX itself. The work is in context.py;
this file only names the tools and says what each is for.
"""
from __future__ import annotations

import functools
import threading

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from . import context
from .models import AgentsAnswer, BoxContext, FindAnswer, NoticesAnswer, ShelfAnswer, SinceAnswer
from .store import migrate


_ready = threading.Lock()
_migrated = False


def _store_ready() -> None:
    """The store is reached on the first question, not at start: a server that
    exited while Docker was still starting showed agents only 'Connection
    closed'. Until the database answers, each question says how to start it."""
    global _migrated
    with _ready:
        if not _migrated:
            migrate()
            _migrated = True


def said(fn):
    """A request AutomatU cannot answer - an unknown box or repository, NoteX
    or the database not running - comes back to the agent in words, not as a
    bare error."""
    @functools.wraps(fn)
    def run(*a, **k):
        try:
            _store_ready()
            return fn(*a, **k)
        except (ValueError, RuntimeError) as e:
            raise ToolError(str(e)) from None
    return run


READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

server = MCPServer(
    name="automatu",
    instructions=(
        "AutomatU arranges a project's plan (File Fabric canvases through NoteX), its code, commits and decisions "
        "(through GitX) and what changed in time, and tells which plan boxes the code has moved past. Ask it for "
        "context before planning or changing a box: notices (what is behind), box (one box's words, code stacked "
        "under it, related boxes, decisions), find (boxes about a subject), since (what changed since a time "
        "or a map), shelf (every box of a canvas with its hex location, to cite), agents (who answers for what). It only reads: write the canvas yourself through NoteX, and record "
        "decisions yourself through GitX."),
)


@server.tool(annotations=READ_ONLY)
@said
def notices(repo: str | None = None, agent: str | None = None) -> NoticesAnswer:
    """The plan boxes the code has moved past, work in progress, and the newest closed notices.
    repo: a bound repository's folder name or path; agent: an agent's name, for the repositories it answers for.
    Neither: every bound repository."""
    return context.notices_for(repo, agent)


@server.tool(annotations=READ_ONLY)
@said
def box(box: str, canvas: str | None = None) -> BoxContext:
    """Everything about one plan box: its words, the commits that built it, the code regions stacked under it,
    its related boxes and why, the decisions its words and code carry, and its open notice if it is behind.
    box: its address, its name, or a number such as "13"; canvas: only when the name is on several canvases."""
    return context.box_context(box, canvas)


@server.tool(annotations=READ_ONLY)
@said
def find(query: str, k: int = 8) -> FindAnswer:
    """The boxes about a subject, by meaning, across every bound canvas - best first. k: how many, up to 25."""
    return context.find_boxes(query, k)


@server.tool(annotations=READ_ONLY)
@said
def since(when: str | None = None, repo: str | None = None, map: int | None = None) -> SinceAnswer:
    """What changed since a moment (ISO time, e.g. 2026-11-10T09:00:00Z) or since a map was made (map: its run
    number, as a hex citation gives it): commits, writes to the plan, maps made, notices opened and closed -
    to catch up on work done by other agents."""
    return context.since(when, repo, map)


@server.tool(annotations=READ_ONLY)
@said
def shelf(canvas: str) -> ShelfAnswer:
    """Every box of one canvas - bound to a repository or not - each with its hex location (cite it by its
    ref, h:<canvas>/<totem id>/<box>), its words, the commits that built it, the code regions under it with
    their commits, the decisions they carry, and the maps the code is as of. One call per canvas."""
    return context.shelf(canvas)


@server.tool(annotations=READ_ONLY)
@said
def agents() -> AgentsAnswer:
    """Which agents answer for which repository, since when, with their open notices."""
    return context.agents_answer()


def run() -> None:
    server.run("stdio")
