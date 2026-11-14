"""Agents placed in AutomatU, one at each desk (box 30, t-e02af0ac56).

A desk the user created in Knowledge Desk has no server of its own, and an
agent in the Claude app or Antigravity takes no message from outside
(t-a961ec4ee3 in Project WorkDesk). So on the hex of a desk's Main canvas the
user chooses an agent for the desk - agy or Claude, and its model - and
AutomatU keeps it: started with no app window over ACP, through Work Desks'
occupant, guard and policy (one copy of them, in Work Desks), and kept running
until the user detaches it or AutomatU stops (t-232d5f3a9a), so what it starts,
such as a website on localhost:8080, keeps running until then
(t-3b3177356e). agy takes about 100 s to start (t-4926a2aec3), so it is started
once and given each message in turn.

Everything the agent does or waits on is in the desk's chat (t-3400eea91e):
the user's messages and other agents', each named by who sent it; its
replies; each permission it asks for, answered by the user in the chat; and
what is queued while it works. The chat is kept whole in AutomatU's store; a
new session is given the last 15 messages, so the agent carries on.

Every desk's agent is also an A2A agent, served on AutomatU's port under
/a2a/<slug>, and Work Desks lists them beside its own desks: any agent reaches
it with ask_desk, and each desk's agent can ask every other with its own
caller's token. A chain of agents asking agents is cut after a few hops, and
never comes back to a desk already in it, which would wait on itself.

AutomatU decides nothing: the words are the user's or the asking agent's,
and every yes to a permission is the user's.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .store import db

AGENTS = ("agy", "claude")
CLAUDE_MODELS = [("claude-opus-5-5", "Claude Opus 5.5"), ("claude-sonnet-5-5", "Claude Sonnet 5.5"),
                 ("claude-haiku-5-5", "Claude Haiku 5.5"), ("claude-fable-5-2", "Claude Fable 5.2")]
AGY_MODELS = [("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"), ("gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"),
              ("gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)")]
CONTEXT = 15            # messages a new session is given
MAX_HOPS = 3            # agents asking agents, at most
KEY = "chat"            # the one piece of work a desk's agent has: its chat
SHOWN = 120             # the chat's newest messages sent to the page
PORT = int(os.environ.get("AUTOMATU_PORT", "7790"))
MCP_ALLOWED = ["knowledgedesk", "notex", "automatu", "desks", "gitx"]   # the desk's own servers: never asked


def missing() -> str:
    """Empty when Work Desks is installed beside AutomatU; else what to do.
    The desk agents run on Work Desks' occupant, guard and policy, and Work
    Desks is not on PyPI, so an AutomatU installed alone has no desk agents."""
    import importlib.util
    if importlib.util.find_spec("workdesks") is None:
        return ("Agents at desks need Work Desks installed beside AutomatU: run "
                r'.venv\Scripts\pip install -e "<Project WorkDesk folder>", then start AutomatU again.')
    return ""


def home() -> Path:
    """Where each desk's agent keeps its folder: its guard, its sessions."""
    return Path(os.environ.get("AUTOMATU_DESK_AGENTS", r"E:\ter-manager\plugins\automatu\desk-agents"))


def caller_name(slug: str) -> str:
    return "desk-agent-" + slug


def said_by(who: str, names: dict[str, str] | None = None) -> str:
    """Who a chat line is from, in words."""
    if who == "user":
        return "You"
    if who == "agent":
        return "The agent"
    if who.startswith("desk-agent-"):
        slug = who[len("desk-agent-"):]
        return f"The agent at the {(names or {}).get(slug, slug)} desk"
    return {"main-agent": "Your agent, through Work Desks", "resume-maker": "Resume Maker",
            "automatu": "AutomatU"}.get(who, who or "Another agent")


# ------------------------------------------------------------------ the store

def _iso(t) -> str:
    return t.isoformat() if hasattr(t, "isoformat") else str(t or "")


def _row(r) -> dict:
    return {"id": r[0], "at": _iso(r[1]), "who": r[2], "kind": r[3], "text": r[4], "state": r[5], "data": r[6] or {}}


def add(desk: str, who: str, kind: str, text: str = "", state: str = "", data: dict | None = None) -> int:
    return db().execute("INSERT INTO desk_message (desk, who, kind, text, state, data) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                        (desk, who, kind, text, state, json.dumps(data or {}))).fetchone()[0]


def mark(mid: int, state: str, data: dict | None = None) -> None:
    if data is None:
        db().execute("UPDATE desk_message SET state=%s WHERE id=%s", (state, mid))
    else:
        db().execute("UPDATE desk_message SET state=%s, data = data || %s::jsonb WHERE id=%s", (state, json.dumps(data), mid))


def messages(desk: str, limit: int = SHOWN, before: int | None = None) -> list[dict]:
    rows = db().execute("SELECT id, at, who, kind, text, state, data FROM desk_message WHERE desk=%s"
                        + (" AND id < %s" if before else "") + " ORDER BY id DESC LIMIT %s",
                        (desk, before, limit) if before else (desk, limit)).fetchall()
    return [_row(r) for r in reversed(rows)]


def chosen(desk: str) -> dict | None:
    r = db().execute("SELECT desk, name, canvas, agent, model, folder, chosen_at FROM desk_agent "
                     "WHERE desk=%s AND detached_at IS NULL", (desk,)).fetchone()
    return None if r is None else {"desk": r[0], "name": r[1], "canvas": r[2], "agent": r[3], "model": r[4],
                                   "folder": r[5], "chosen_at": _iso(r[6])}


def all_chosen() -> list[dict]:
    rows = db().execute("SELECT desk FROM desk_agent WHERE detached_at IS NULL ORDER BY desk").fetchall()
    return [chosen(r[0]) for r in rows]


# ------------------------------------------------------------------ models

_agy_models: list[tuple[str, str]] | None = None


def models() -> dict[str, list[dict]]:
    """What each agent can run, for the choice: agy's from agy itself, read
    once; Claude's by name."""
    global _agy_models
    if _agy_models is None:
        _agy_models = AGY_MODELS
        try:
            from workdesks.config import agy_path
            out = subprocess.run([agy_path(), "models"], capture_output=True, text=True, encoding="utf8", timeout=60).stdout
            got = [tuple(line.split("\t", 1)) for line in out.splitlines() if "\t" in line]
            if got:
                _agy_models = [(a.strip(), b.strip()) for a, b in got]
        except Exception:
            pass
    return {"agy": [{"id": i, "name": n} for i, n in _agy_models],
            "claude": [{"id": i, "name": n} for i, n in CLAUDE_MODELS]}


# ------------------------------------------------------------------ one desk's agent

@dataclass
class Item:
    """A message given to the agent: queued, then worked on, then answered."""
    id: int
    who: str
    text: str
    chain: list[str] = field(default_factory=list)   # the desks whose agents asked, in order
    done: asyncio.Future | None = None
    steps: list[dict] = field(default_factory=list)
    said: list[str] = field(default_factory=list)


class DeskAgent:
    def __init__(self, rec: dict, desk: dict):
        self.slug, self.rec, self.desk = rec["desk"], rec, desk
        self.queue: list[Item] = []
        self.running: Item | None = None
        self.state = "idle"
        self.asks: dict[int, asyncio.Future] = {}
        self._wake = asyncio.Event()
        self._task: asyncio.Task | None = None
        self.occupant = self._occupant()

    # the agent, as Work Desks seats one
    def folder(self) -> Path:
        return home() / self.slug

    def instructions(self) -> str:
        d, r = self.desk, self.rec
        return "\n".join([
            f"You are the agent AutomatU keeps at the {d['name']} desk, chosen by the user.",
            f"The desk's role: {d.get('role') or 'not written yet'}.",
            f"Its Main canvas, which you write through NoteX as \"{d.get('owner') or self.slug}\" (the desk's own name): {d['main_canvas']}.",
            f"Its Attached canvases, which you read and track: {', '.join(d.get('attached') or []) or 'none'}.",
            f"The project's folder, where you do the work and run commands: {r['folder']}.",
            f"At the start of a session, sit at the desk: call Knowledge Desk's sit tool with the desk \"{d['name']}\".",
            "Work comes to you from the user, in AutomatU's chat on the desk's hex, or from the agent at another desk over "
            "A2A; each message says who it is from. Answer the one who sent it.",
            "To ask the agent at another desk, or one of Work Desks' own desks, use the desks MCP server: desks lists them "
            "and ask_desk sends the work.",
            "What you start to keep running, such as a development server, keeps running until the user detaches you or "
            "closes AutomatU: start it in the background and do not wait for it to end.",
            "Some actions need the user's yes, asked in the chat. If one is refused, carry on without it and say plainly "
            "what you could not do.",
        ])

    def _occupant(self):
        from acp.schema import EnvVariable, McpServerStdio
        from workdesks.config import automatu_command, data_dir, notex_mcp_path
        from workdesks.occupant import Occupant, Policy
        r, folder = self.rec, self.folder()
        work = Path(r["folder"])
        desks = McpServerStdio(name="desks", command=sys.executable, args=["-m", "workdesks.cli", "mcp"], env=[
            EnvVariable(name="WORKDESKS_CALLER", value=caller_name(self.slug)),
            EnvVariable(name="WORKDESKS_DATA", value=str(data_dir()))])
        servers = [desks]
        if r["agent"] == "claude":
            # Claude at a desk reads only the desk folder's settings, so the
            # desk's servers are handed over here; agy takes the user's own
            # MCP config, Knowledge Desk, NoteX and AutomatU among them.
            exe, args = automatu_command()
            servers += [McpServerStdio(name="knowledgedesk", command=sys.executable, args=["-m", "knowledgedesk.cli", "mcp"], env=[]),
                        McpServerStdio(name="notex", command="node", args=[notex_mcp_path()], env=[]),
                        McpServerStdio(name="automatu", command=exe, args=args, env=[])]
        # agy reads a tool's description from its own folder before calling it:
        # the desk's own servers' descriptions are read without asking.
        tools = [Path.home() / ".gemini" / "antigravity-cli" / "mcp" / s for s in MCP_ALLOWED] if r["agent"] == "agy" else []
        policy = Policy(desk_dir=folder, write_dirs=[work, folder / "output"], ask=self._ask, read_dirs=[work, *tools],
                        mcp_servers=MCP_ALLOWED, canvases=[self.desk["main_canvas"]],
                        owner=self.desk.get("owner") or None)
        command = None
        stand_in = os.environ.get("AUTOMATU_DESK_AGENT_CMD")
        if stand_in:
            command = json.loads(stand_in)
        elif r["agent"] == "agy":
            from workdesks.config import agy_path
            command = [agy_path(), "--settings", json.dumps({"trustedWorkspaces": [str(folder.resolve())]}),
                       "--model", r["model"], "acp"]
        return Occupant(folder, instructions=self.instructions(), mcp_servers=servers, policy=policy,
                        command=command, agent=r["agent"], model=r["model"] if r["agent"] == "claude" else None)

    # the chat
    def give(self, who: str, text: str, chain: list[str] | None = None) -> Item:
        mid = add(self.slug, who, "message", text, "queued", {"chain": chain or []})
        it = Item(id=mid, who=who, text=text, chain=list(chain or []), done=asyncio.get_running_loop().create_future())
        self.queue.append(it)
        self._wake.set()
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._work())
        return it

    def take_back(self, mid: int) -> bool:
        it = next((x for x in self.queue if x.id == mid), None)
        if it is None:
            return False
        self.queue.remove(it)
        mark(mid, "taken back")
        _settle(it, {"state": "failed", "error": "the user took the message back before the agent started on it"})
        return True

    async def _ask(self, a) -> bool:
        """A permission the guard and policy could not decide: asked in the chat,
        answered by the user only."""
        it = self.running
        mid = add(self.slug, "agent", "ask", a.title or a.name or a.kind, "waiting",
                  {"kind": a.kind, "paths": a.paths, "for": it.id if it else None})
        fut = asyncio.get_running_loop().create_future()
        self.asks[mid] = fut
        self.state = "waiting"
        try:
            ok = bool(await fut)
        finally:
            self.asks.pop(mid, None)
            self.state = "working"
        mark(mid, "allowed" if ok else "refused")
        return ok

    def answer(self, mid: int, allow: bool) -> bool:
        fut = self.asks.get(mid)
        if fut is None or fut.done():
            return False
        fut.set_result(allow)
        return True

    async def _event(self, ev) -> None:
        it = self.running
        if it is None:
            return
        if ev.kind == "message":
            it.said.append(ev.text)
        elif ev.kind == "tool":
            it.steps.append({"title": ev.text or "a tool", "status": "working"})
        elif ev.kind == "tool_done":
            open_ = next((s for s in reversed(it.steps) if s["status"] == "working" and (not ev.text or s["title"] == ev.text)), None) \
                or next((s for s in reversed(it.steps) if s["status"] == "working"), None)
            if open_:
                open_["status"] = "done" if ev.data.get("status") == "completed" else "failed"

    def _context(self, upto: int) -> str:
        """The chat so far, for a session that does not remember it."""
        rows = [m for m in messages(self.slug, CONTEXT * 3, before=upto) if m["kind"] in ("message", "reply")][-CONTEXT:]
        if not rows:
            return ""
        names = {self.slug: self.desk["name"]}
        lines = [f"[{said_by(m['who'], names)}] {m['text']}" for m in rows]
        return ("Your conversation at this desk so far - the last " + str(len(rows)) + " messages, kept by AutomatU:\n"
                + "\n".join(lines) + "\n\nNow:\n")

    async def _work(self) -> None:
        while True:
            if not self.queue:
                self._wake.clear()
                await self._wake.wait()
                continue
            it = self.queue.pop(0)
            self.running = it
            mark(it.id, "running")
            result = {"state": "failed", "error": ""}
            try:
                self.state = "starting"
                before = self.occupant.session_of(KEY)
                sid = await self.occupant.open(KEY)
                prefix = self._context(it.id) if sid != before else ""
                head = "" if it.who == "user" else f"A message from {said_by(it.who)}, over A2A:\n"
                self.state = "working"
                t = await self.occupant.turn(KEY, prefix + head + it.text, on_event=self._event)
                text = t.text.strip()
                if t.stop_reason == "cancelled":
                    mark(it.id, "stopped")
                    add(self.slug, "agent", "reply", text or "Stopped before it finished.", "stopped",
                        {"for": it.id, "steps": it.steps})
                    result = {"state": "failed", "error": "the user stopped it", "reply": text}
                else:
                    mark(it.id, "done")
                    add(self.slug, "agent", "reply", text or "(the agent said nothing)", "", {
                        "for": it.id, "steps": it.steps, "refused": t.refused})
                    result = {"state": "completed", "reply": text}
            except Exception as e:
                why = f"{type(e).__name__}: {e}"[:500]
                mark(it.id, "failed")
                add(self.slug, "agent", "note", "The agent could not do it: " + why, "failed", {"for": it.id})
                result = {"state": "failed", "error": why}
            finally:
                self.running = None
                self.state = "idle"
                _settle(it, result)

    async def stop(self) -> bool:
        if self.running is None:
            return False
        for f in list(self.asks.values()):
            if not f.done():
                f.set_result(False)
        await self.occupant.cancel(KEY)
        return True

    async def close(self, why: str) -> None:
        """Off the desk: what it is doing stops, what waits is not run, and its
        process - and whatever it started - goes."""
        for it in list(self.queue):
            mark(it.id, "not run")
            _settle(it, {"state": "failed", "error": why})
        self.queue.clear()
        if self.running is not None:
            try:
                await asyncio.wait_for(self.stop(), 5)
            except Exception:
                pass
        if self._task is not None:
            self._task.cancel()
        await self.occupant.close()

    def now(self) -> dict:
        it = self.running
        return {"agent": self.rec["agent"], "model": self.rec["model"], "folder": self.rec["folder"],
                "chosen_at": self.rec["chosen_at"], "state": self.state, "working_on": it.id if it else None,
                "steps": list(it.steps) if it else [], "said": "".join(it.said) if it else ""}


def _settle(it: Item, result: dict) -> None:
    if it.done is not None and not it.done.done():
        it.done.set_result(result)


# ------------------------------------------------------------------ every desk's agent, on a loop of their own

class Manager:
    """Every agent placed at a desk, worked on one event loop in a thread of
    its own, so a long task never holds up a page."""

    def __init__(self):
        self.agents: dict[str, DeskAgent] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self._started = threading.Lock()
        self._apps: dict[str, object] = {}
        self._hold = None            # the connection that holds the desk agents' lock, while this AutomatU runs them

    def holds(self) -> bool:
        """Whether this AutomatU runs the desk agents. Only one AutomatU on a
        store may: two would each start the same desk's agent and write the
        same chat. The first to ask takes a Postgres advisory lock on a
        connection of its own, held as long as it runs, so a second AutomatU -
        a test server beside the user's, say - runs none, and the lock goes
        when the first stops, however it stops (t-9ac895056e)."""
        with self._started:
            if self._hold is not None and not self._hold.closed:
                return True
            import psycopg
            from .store import DB_URL
            conn = psycopg.connect(os.environ.get("AUTOMATU_DB_URL", DB_URL), autocommit=True, connect_timeout=5)
            if conn.execute("SELECT pg_try_advisory_lock(hashtext('automatu-desk-agents'))").fetchone()[0]:
                self._hold = conn
                return True
            conn.close()
            return False

    def _ensure(self) -> asyncio.AbstractEventLoop:
        with self._started:
            if self.loop is None:
                if sys.platform == "win32":
                    loop = asyncio.ProactorEventLoop()      # subprocesses need it on Windows
                else:
                    loop = asyncio.new_event_loop()
                threading.Thread(target=loop.run_forever, name="desk-agents", daemon=True).start()
                self.loop = loop
        return self.loop

    def call(self, coro, timeout: float = 30):
        return asyncio.run_coroutine_threadsafe(coro, self._ensure()).result(timeout)

    def submit(self, coro) -> concurrent.futures.Future:
        return asyncio.run_coroutine_threadsafe(coro, self._ensure())

    # what is kept, taken up again at the start
    def restore(self, desks: list[dict]) -> None:
        """The agents the user chose before AutomatU last stopped: placed again,
        their processes started at their next message. What was running or
        queued when it stopped is marked so. Only the AutomatU that runs the desk
        agents does this; another touches nothing, and so does one without Work Desks."""
        if missing() or not self.holds():
            return
        db().execute("UPDATE desk_message SET state='stopped' WHERE kind='message' AND state IN ('queued','running')")
        db().execute("UPDATE desk_message SET state='not answered' WHERE kind='ask' AND state='waiting'")
        by = {d["slug"]: d for d in desks}
        for rec in all_chosen():
            # Knowledge Desk not answering: the desk as it was when chosen
            d = by.get(rec["desk"]) or {"slug": rec["desk"], "name": rec["name"], "main_canvas": rec["canvas"]}
            self.call(self._place(rec, d))

    async def _place(self, rec: dict, desk: dict) -> DeskAgent:
        a = DeskAgent(rec, desk)
        self.agents[rec["desk"]] = a
        return a

    def get(self, slug: str) -> DeskAgent | None:
        return self.agents.get(slug)

    def refresh(self, desk: dict) -> None:
        """The desk as Knowledge Desk says now: an agent placed while it was not
        answering - with only the desk's name and Main canvas - is given its
        role, canvases and owner name, for its next session, its guard and its
        card (t-35279017ea)."""
        a = self.get(desk.get("slug") or "")
        keys = ("name", "role", "main_canvas", "attached", "owner")
        if a is None or not desk.get("name") or all(a.desk.get(k) == desk.get(k) for k in keys):
            return
        a.desk = {**a.desk, **{k: desk.get(k) for k in keys}}
        o = a.occupant
        o.instructions = a.instructions()
        o.policy.canvases = [a.desk["main_canvas"]]
        o.policy.owner = a.desk.get("owner") or None
        if (o.desk_dir / ".agents").exists() or (o.desk_dir / ".claude").exists():
            o.install_guard()          # a running agent's guard reads its lists afresh at each call
        self._apps.pop(a.slug, None)

    def choose(self, desk: dict, agent: str, model: str, folder: str) -> dict:
        if agent not in AGENTS:
            raise ValueError("choose agy or claude")
        if not model:
            raise ValueError("choose a model")
        known = {m["id"] for m in models()[agent]}
        if model not in known:
            raise ValueError(f"{model} is not one of {agent}'s models")
        f = Path(folder or "")
        if not folder or not f.is_dir():
            raise ValueError("give the folder where the agent does the work: one that exists on this PC")
        if missing():
            raise ValueError(missing())
        if not self.holds():
            raise ValueError(ELSEWHERE)
        slug = desk["slug"]
        if self.get(slug) is not None:
            raise ValueError(f"an agent is already at the {desk['name']} desk: detach it first")
        db().execute("INSERT INTO desk_agent (desk, name, canvas, agent, model, folder) VALUES (%s,%s,%s,%s,%s,%s) "
                     "ON CONFLICT (desk) DO UPDATE SET name=excluded.name, canvas=excluded.canvas, agent=excluded.agent, "
                     "model=excluded.model, folder=excluded.folder, chosen_at=now(), detached_at=NULL",
                     (slug, desk["name"], desk["main_canvas"], agent, model, str(f.resolve())))
        # a new agent: no session of the one before carries over
        (home() / slug / "sessions.json").unlink(missing_ok=True)
        add(slug, "user", "note", f"Placed {'Antigravity (agy)' if agent == 'agy' else 'Claude'} at the desk, "
                                  f"on {model}, working in {f.resolve()}.")
        return self.call(self._place(chosen(slug), desk)).now()

    def detach(self, slug: str) -> bool:
        a = self.agents.pop(slug, None)
        if a is None:
            return False
        self._apps.pop(slug, None)
        try:
            self.call(a.close("the agent was detached from the desk"), timeout=20)
        except Exception:
            pass
        db().execute("UPDATE desk_agent SET detached_at=now() WHERE desk=%s", (slug,))
        add(slug, "user", "note", "Detached the agent: it is off the desk, and what it started has stopped.")
        return True

    def close_all(self) -> None:
        """AutomatU stops: every agent goes, with what it started."""
        if self.loop is None:
            return
        for a in list(self.agents.values()):
            try:
                self.call(a.close("AutomatU stopped"), timeout=10)
            except Exception:
                pass

    def give(self, slug: str, who: str, text: str, chain: list[str] | None = None) -> int:
        a = self.get(slug)
        if a is None:
            raise ValueError("no agent is at this desk: choose one first")
        if not (text or "").strip():
            raise ValueError("write the message")

        async def go():
            return a.give(who, text.strip(), chain).id
        return self.call(go())

    def answer(self, slug: str, ask: int, allow: bool) -> bool:
        a = self.get(slug)

        async def go():
            return a.answer(ask, allow)
        return bool(a and self.call(go()))

    def take_back(self, slug: str, item: int) -> bool:
        a = self.get(slug)

        async def go():
            return a.take_back(item)
        return bool(a and self.call(go()))

    def stop(self, slug: str) -> bool:
        a = self.get(slug)
        return bool(a and self.call(a.stop()))

    def now(self, slug: str) -> dict | None:
        a = self.get(slug)
        if a is None:
            return None

        async def go():
            return a.now()
        return self.call(go())

    # over A2A
    def chain_of(self, caller: str, to: str) -> list[str]:
        """The desks whose agents asked, down to this one; refused when it is too
        long or comes back to the desk asked, which would wait on itself."""
        if not caller.startswith("desk-agent-"):
            return []
        frm = caller[len("desk-agent-"):]
        a = self.get(frm)
        chain = (list(a.running.chain) if a and a.running else []) + [frm]
        if to in chain:
            raise ValueError("the agent at this desk is already waiting in this chain of asks, so it cannot answer it")
        if len(chain) >= MAX_HOPS:
            raise ValueError(f"agents have asked agents {len(chain)} times in this chain: ask the user instead")
        return chain

    def a2a_app(self, slug: str):
        if self.get(slug) is None:
            return None
        if slug not in self._apps:
            self._apps[slug] = _a2a_app(self, slug)
        return self._apps[slug]

    def cards(self) -> list[dict]:
        return [{"slug": s, "name": a.desk["name"], "role": a.desk.get("role") or "", "canvas": a.desk.get("main_canvas") or "",
                 "agent": a.rec["agent"], "model": a.rec["model"]} for s, a in sorted(self.agents.items())]


MANAGER = Manager()
ELSEWHERE = ("Another AutomatU on this PC runs the desk agents, so this one runs none: open that one, or stop it "
             "and start this one again.")


# ------------------------------------------------------------------ the A2A side

def _a2a_app(m: Manager, slug: str):
    from a2a.helpers.proto_helpers import new_task_from_user_message, new_text_message, new_text_part
    from a2a.server.agent_execution import AgentExecutor
    from a2a.server.tasks import TaskUpdater
    from a2a.types import AgentSkill, TaskState
    from workdesks import a2a_desk
    from workdesks.config import Desk

    a = m.get(slug)
    desk = Desk(slug=slug, name=a.desk["name"], port=PORT, path=f"/a2a/{slug}")

    class Executor(AgentExecutor):
        async def execute(self, context, event_queue):
            if not context.current_task:
                await event_queue.enqueue_event(new_task_from_user_message(context.message))
            u = TaskUpdater(event_queue, context.task_id, context.context_id)
            await u.start_work()
            who = a2a_desk.caller(context) or "another agent"
            text = context.get_user_input()

            def msg(t):
                return new_text_message(t, context_id=context.context_id, task_id=context.task_id)
            try:
                chain = m.chain_of(who, slug)
                agent = m.get(slug)
                if agent is None:
                    raise ValueError(f"no agent is at the {desk.name} desk now")
                fut = m.submit(_give_and_wait(agent, who, text, chain))
            except ValueError as e:
                await u.failed(msg(str(e)))
                return
            told = False
            while not fut.done():
                await asyncio.sleep(1)
                agent = m.get(slug)
                if not told and agent and agent.asks:
                    told = True
                    await u.update_status(TaskState.TASK_STATE_WORKING, msg(
                        f"The agent at the {desk.name} desk is waiting on the user's yes in AutomatU's chat."))
            r = fut.result()
            if r.get("state") == "completed":
                if r.get("reply"):
                    await u.add_artifact([new_text_part(r["reply"])], name="reply")
                await u.complete()
            else:
                await u.failed(msg(f"The agent at the {desk.name} desk could not do it: {r.get('error') or 'no reason given'}"))

        async def cancel(self, context, event_queue):
            pass   # only the user stops the agent, from the chat

    card = a2a_desk.card(desk, f"The agent AutomatU keeps at the {desk.name} desk: {a.desk.get('role') or ''}".strip(),
                         [AgentSkill(id="work", name="Work", tags=["desk"], description=(
                             f"Give the agent at the {desk.name} desk work in words; it answers in words, and what "
                             "needs the user's yes is asked of the user in AutomatU."),
                             examples=[f"Start the {desk.name} project's site on localhost:8080."])],
                         inputs=["text/plain"], outputs=["text/plain"], streaming=True)
    card.provider.organization = "AutomatU"
    return a2a_desk.app(card, Executor())


async def _give_and_wait(agent: DeskAgent, who: str, text: str, chain: list[str]) -> dict:
    it = agent.give(who, text, chain)
    return await it.done


class A2AMount:
    """/a2a/<slug>/...: each desk's agent as an A2A agent, on AutomatU's port."""

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        path, root = scope.get("path", ""), scope.get("root_path", "")
        rel = path[len(root):] if root and path.startswith(root) else path
        if rel.startswith("/a2a/"):
            rel = rel[len("/a2a"):]
        mm = re.match(r"^/([a-z0-9][a-z0-9-]*)(/.*)?$", rel)
        app = MANAGER.a2a_app(mm.group(1)) if mm else None
        if app is None:
            body = b'{"error": "no agent is at that desk"}'
            await send({"type": "http.response.start", "status": 404,
                        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return
        sub = dict(scope)
        sub["root_path"] = ""
        sub["path"] = mm.group(2) or "/"
        sub["raw_path"] = sub["path"].encode()
        await app(sub, receive, send)
