"""Talking to the agent from its hex (box 30, t-275ce407f2).

AutomatU stands on its own: from an agent canvas's hex the user gives the agent
that answers for it one task. The agent is the user's own - the Claude app's or
Antigravity's, with the user's model, settings, instructions and MCP servers
(t-65702312e4) - run as a live ACP session on the user's login, never a
headless call and never an API key (t-af8ebbf9c5 in Project WorkDesk).

It continues a COPY of one of the agent's recent conversations on the project,
so the conversation open in the app never has two writers; what is said here is
a branch the app does not see, and the copy is removed when the task is done.

Conversations are found where the apps keep them (t-51675a7203): a Claude
conversation belongs to a project when it was opened in the project's folder or
worked inside it, an Antigravity conversation when the desktop app's workspace
for it is the project's folder. Only the user's own conversations count - the
Claude app and terminal, Antigravity's desktop app - not the desks' sessions.

This is the one place AutomatU runs an agent, at the user's word: the words and
every yes to a permission are the user's, and AutomatU decides nothing.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from acp import PROTOCOL_VERSION, spawn_agent_process
from acp.schema import AllowedOutcome, DeniedOutcome, RequestPermissionResponse, TextContentBlock

USER_ENTRYPOINTS = {"claude-desktop", "cli", "claude-vscode"}
LIMIT = 5
ASK_WAIT = 600.0     # a permission ask nobody answers is refused after ten minutes


def claude_home() -> Path:
    return Path(os.environ.get("AUTOMATU_CLAUDE_HOME") or Path.home() / ".claude")


def gemini_home() -> Path:
    return Path(os.environ.get("AUTOMATU_GEMINI_HOME") or Path.home() / ".gemini")


def _norm(p: str) -> str:
    """A path as one spelling: forward slashes, lower case, no trailing slash."""
    return p.replace("\\", "/").rstrip("/").lower()


def _under(path: str, repo: str) -> bool:
    p, r = _norm(path), _norm(repo)
    return p == r or p.startswith(r + "/")


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


# ------------------------------------------------------------ Claude's conversations

_claude_seen: dict[str, dict] = {}   # path -> what was read of it, read on from where it stopped
_scan_lock = threading.Lock()


def _claude_read(path: Path, repos: tuple[str, ...]) -> dict:
    """What one Claude conversation file says: its folder, title, where it came
    from, and which repositories it worked in. A file that only grew is read on
    from where it was left; one that shrank, or a new repository list, is read
    again from the start."""
    st = path.stat()
    key = str(path)
    seen = _claude_seen.get(key)
    if not seen or seen["repos"] != repos or st.st_size < seen["offset"]:
        seen = {"repos": repos, "offset": 0, "cwds": [], "title": "", "prompt": "", "entry": set(), "mentions": set(), "desks": set()}
    with open(path, "rb") as f:
        f.seek(seen["offset"])
        while True:
            chunk = f.read(CHUNK)          # a long conversation runs to hundreds of megabytes
            while chunk and b"\n" not in chunk:
                more = f.read(CHUNK)       # one line longer than a chunk: read on to its end
                if not more:
                    break
                chunk += more
            end = chunk.rfind(b"\n") + 1   # a line still being written waits for the next read
            if not chunk or not end:
                break
            _claude_lines(seen, chunk[:end].decode("utf8", errors="replace"), repos)
            seen["offset"] += end
            f.seek(seen["offset"])
    seen["mtime"] = st.st_mtime
    seen["title"] = seen.get("custom") or seen.get("ai") or ""
    _claude_seen[key] = seen
    return seen


CHUNK = 8 << 20
_SLASHES = re.compile(r"[\\/]+")


def _claude_lines(seen: dict, body: str, repos: tuple[str, ...]) -> None:
    flat = _SLASHES.sub("/", body).lower()     # E:\\Coding CLI\\X in JSON, E:/Coding CLI/X, any run of either
    for r in repos:
        if _norm(r) in flat:
            seen["mentions"].add(r)
    for line in body.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("cwd") and row["cwd"] not in seen["cwds"]:
            seen["cwds"].append(row["cwd"])          # a conversation moves between folders as it works
        if row.get("entrypoint"):
            seen["entry"].add(row["entrypoint"])
        if row.get("type") == "custom-title" and row.get("customTitle"):
            seen["custom"] = row["customTitle"]           # a title the user gave wins over the app's own
        elif row.get("type") == "ai-title" and row.get("aiTitle"):
            seen["ai"] = row["aiTitle"]
        elif row.get("type") == "last-prompt" and row.get("lastPrompt"):
            seen["prompt"] = row["lastPrompt"]
        if "__sit" in line:
            # the conversation sat at a desk: Knowledge Desk's sit, with the desk it named
            for c in (row.get("message") or {}).get("content") or []:
                if isinstance(c, dict) and c.get("type") == "tool_use" and str(c.get("name", "")).endswith("knowledgedesk__sit"):
                    desk = str((c.get("input") or {}).get("desk") or "").strip().lower()
                    if desk:
                        seen["desks"].add(desk)


def _mangled(folder: str) -> str:
    """How Claude names the folder it files a conversation under: every
    character but a letter or a digit becomes a dash."""
    return re.sub(r"[^A-Za-z0-9]", "-", folder)


def home_folder(path: Path, cwds: list[str]) -> str:
    """The folder a conversation is loaded from: the one of its folders that
    Claude files it under, for loading looks there; else the first."""
    return next((c for c in cwds if _mangled(c) == path.parent.name), cwds[0] if cwds else "")


def claude_conversations(repo: str | None, repos: tuple[str, ...], desks: set[str] | None = None) -> list[dict]:
    """The user's own Claude conversations on a project - opened in its folder
    or worked in it - or, given desks, the ones that sat at one of them."""
    out = []
    root = claude_home() / "projects"
    if not root.is_dir():
        return out
    for path in root.glob("*/*.jsonl"):
        cid = path.stem
        if cid in _COPIES:
            continue
        try:
            s = _claude_read(path, repos)
        except OSError:
            continue
        if not (s["entry"] & USER_ENTRYPOINTS):
            continue          # the desks' and the adapter's own sessions are not the user's conversations
        on_project = bool(repo) and (any(_under(c, repo) for c in s["cwds"]) or repo in s["mentions"])
        at_desk = bool(desks) and bool(s.get("desks", set()) & desks)
        if not (on_project or at_desk):
            continue
        out.append({"platform": "claude", "id": cid, "title": s["title"] or s["prompt"][:80] or "Untitled",
                    "at": _iso(s["mtime"]), "cwd": home_folder(path, s["cwds"])})
    return out


# ------------------------------------------------------------ Antigravity's conversations

def _agy_app() -> Path:
    return gemini_home() / "antigravity"


def _agy_cli() -> Path:
    return gemini_home() / "antigravity-cli"


def agy_conversations(repo: str) -> list[dict]:
    db = _agy_app() / "conversation_summaries.db"
    if not db.exists():
        return []
    out = []
    try:
        c = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
        rows = c.execute("SELECT conversation_id, title, preview, last_modified_time, workspace_uris, source "
                         "FROM conversation_summaries").fetchall()
        c.close()
    except sqlite3.Error:
        return []
    for cid, title, preview, at, uris, source in rows:
        if "CLI" in str(source or ""):
            continue          # the desks' sessions, kept in agy's own store
        if cid in _COPIES or not (_agy_app() / "conversations" / f"{cid}.db").exists():
            continue
        try:
            spaces = [unquote(u).removeprefix("file:///").removeprefix("file://") for u in json.loads(uris or "[]")]
        except ValueError:
            spaces = []
        if not any(_under(w, repo) for w in spaces):
            continue
        out.append({"platform": "antigravity", "id": cid, "title": title or (preview or "")[:80] or "Untitled",
                    "at": str(at or ""), "cwd": spaces[0] if spaces else ""})
    return out


def _sort_key(c: dict) -> str:
    # Antigravity writes '2026-11-10 21:24:32.9281088+00:00', Claude ISO; both sort as text
    return c["at"].replace(" ", "T")[:19]


def conversations(repo: str, repos: tuple[str, ...] | None = None, limit: int = LIMIT) -> list[dict]:
    """The agent's latest conversations on this project, newest first."""
    repos = tuple(repos or (repo,))
    with _scan_lock:          # the warm-up and a click may look at once
        found = claude_conversations(repo, repos) + agy_conversations(repo)
    return sorted(found, key=_sort_key, reverse=True)[:limit]


def desk_conversations(desks: set[str], repos: tuple[str, ...] = (), limit: int = LIMIT) -> list[dict]:
    """The conversations that sat at a desk - by its name or its slug - newest
    first: the agents of a canvas that plans no repository but is a desk's
    Main canvas, found by the sit they called (Knowledge Desk's sit tool)."""
    desks = {d.strip().lower() for d in desks if d}
    if not desks:
        return []
    with _scan_lock:
        found = claude_conversations(None, tuple(repos), desks)
    return sorted(found, key=_sort_key, reverse=True)[:limit]


# ------------------------------------------------------------ a copy, never the original

_COPIES: set[str] = set()   # conversations being worked as copies now: never listed


def copy_claude(conversation: str) -> tuple[str, str, callable]:
    """A copy of a Claude conversation under a new id, beside it in Claude's
    store: (copy id, the folder it was opened in, how to remove it)."""
    matches = list((claude_home() / "projects").glob(f"*/{conversation}.jsonl"))
    if not matches:
        raise LookupError("no Claude conversation " + conversation)
    src = matches[0]
    new = str(uuid.uuid4())
    dst = src.with_name(new + ".jsonl")
    # A long conversation runs to hundreds of megabytes, so the copy is streamed
    # and the id - the same length either way - swapped as bytes, at disk speed.
    old_b, new_b = conversation.encode(), new.encode()
    keep = len(old_b) - 1
    with open(src, "rb") as a, open(dst, "wb") as b:
        tail = b""
        while True:
            chunk = a.read(CHUNK)
            if not chunk:
                b.write(tail)
                break
            buf = (tail + chunk).replace(old_b, new_b)
            b.write(buf[:-keep] if len(buf) > keep else b"")
            tail = buf[-keep:] if len(buf) > keep else buf
    _COPIES.add(new)
    seen = _claude_seen.get(str(src))
    cwds = seen["cwds"] if seen else _claude_read(src, ()).get("cwds", [])
    cwd = home_folder(src, cwds)

    def remove() -> None:
        dst.unlink(missing_ok=True)
        shutil.rmtree(dst.with_suffix(""), ignore_errors=True)     # what Claude kept beside it for the copy
        _COPIES.discard(new)
    return new, cwd, remove


def copy_agy(conversation: str) -> tuple[str, callable]:
    """A copy of an Antigravity app conversation in agy's own store, under the
    same id - its ids are written inside its binary steps (t-d0a1fe4876) - so
    the app keeps writing its own file and agy writes only the copy. Taken with
    SQLite's backup, so a half-written file is never copied."""
    src = _agy_app() / "conversations" / f"{conversation}.db"
    dst = _agy_cli() / "conversations" / f"{conversation}.db"
    if not src.exists():
        raise LookupError("no Antigravity conversation " + conversation)
    if dst.exists():
        raise FileExistsError("agy's own store already holds this conversation, so it cannot be copied there")
    dst.parent.mkdir(parents=True, exist_ok=True)
    a = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
    b = sqlite3.connect(dst)
    a.backup(b)
    b.close()
    a.close()
    _COPIES.add(conversation)

    def remove() -> None:
        for f in (dst, dst.with_name(dst.name + "-wal"), dst.with_name(dst.name + "-shm")):
            f.unlink(missing_ok=True)
        shutil.rmtree(_agy_cli() / "brain" / conversation, ignore_errors=True)
        summaries = _agy_cli() / "conversation_summaries.db"
        if summaries.exists():
            with sqlite3.connect(summaries) as s:
                s.execute("DELETE FROM conversation_summaries WHERE conversation_id = ?", (conversation,))
        _COPIES.discard(conversation)
    return conversation, remove


# ------------------------------------------------------------ the agents

def claude_adapter() -> list[str]:
    return ["node", os.environ.get("AUTOMATU_CLAUDE_ACP", r"E:\ter-manager\plugins\work-desks\agents\claude-acp"
                                   r"\node_modules\@agentclientprotocol\claude-agent-acp\dist\index.js")]


def agy_command(cwd: str) -> list[str]:
    agy = os.environ.get("AUTOMATU_AGY", os.path.expandvars(r"%LOCALAPPDATA%\agy\bin\agy.exe"))
    # Trusts the folder for this process only; the user's own settings stay as they are.
    return [agy, "--settings", json.dumps({"trustedWorkspaces": [cwd]}), "acp"]


# ------------------------------------------------------------ one task

class Talk:
    """One task given from a hex: its words, and what the agent says and does."""

    def __init__(self, canvas: str, repo: str, platform: str, conversation: str, text: str):
        self.id = "talk-" + uuid.uuid4().hex[:10]
        self.canvas, self.repo, self.platform, self.conversation, self.text = canvas, repo, platform, conversation, text
        self.state = "starting"       # starting, working, asking, done, stopped, failed
        self.reply: list[str] = []
        self.steps: list[dict] = []
        self.ask: dict | None = None
        self.error = ""
        self.started = time.time()
        self.ended: float | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._answer: asyncio.Future | None = None
        self._conn = None
        self._session = ""

    def view(self) -> dict:
        return {"id": self.id, "canvas": self.canvas, "platform": self.platform, "conversation": self.conversation,
                "text": self.text, "state": self.state, "reply": "".join(self.reply), "steps": self.steps[-30:],
                "ask": self.ask, "error": self.error, "started": _iso(self.started),
                "ended": _iso(self.ended) if self.ended else None}

    @property
    def live(self) -> bool:
        return self.state in ("starting", "working", "asking")

    # the user's acts, passed on from the page's own thread
    def answer(self, option: str | None) -> bool:
        if not (self._loop and self._answer and not self._answer.done()):
            return False
        self._loop.call_soon_threadsafe(lambda: self._answer.done() or self._answer.set_result(option))
        return True

    def stop(self) -> None:
        if self._loop and self._conn and self._session and self.live:
            asyncio.run_coroutine_threadsafe(self._conn.cancel(session_id=self._session), self._loop)
            self.answer(None)


class _Client:
    """The agent's side of the conversation, heard for one task."""

    def __init__(self, t: Talk):
        self.t, self.listening = t, False

    def on_connect(self, conn) -> None:
        pass

    async def session_update(self, session_id, update, **kw):
        if not self.listening:
            return          # a loaded conversation replaying its old turns
        k = update.session_update
        if k == "agent_message_chunk" and getattr(update.content, "text", None):
            self.t.reply.append(update.content.text)
        elif k == "tool_call":
            self.t.steps.append({"id": update.tool_call_id, "title": update.title or "a tool", "status": update.status or "pending"})
        elif k == "tool_call_update":
            for s in self.t.steps:
                if s["id"] == update.tool_call_id:
                    s["status"] = update.status or s["status"]
                    if update.title:
                        s["title"] = update.title

    async def request_permission(self, session_id, tool_call, options, **kw):
        t = self.t
        t.ask = {"title": getattr(tool_call, "title", None) or "a tool",
                 "options": [{"id": o.option_id, "name": o.name, "kind": o.kind} for o in options]}
        t.state = "asking"
        t._answer = asyncio.get_running_loop().create_future()
        try:
            choice = await asyncio.wait_for(t._answer, ASK_WAIT)
        except asyncio.TimeoutError:
            choice = None
        t.ask = None
        if t.state == "asking":
            t.state = "working"
        if choice and any(o.option_id == choice for o in options):
            return RequestPermissionResponse(outcome=AllowedOutcome(outcome="selected", option_id=choice))
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))

    def __getattr__(self, name):          # files, terminals and the rest: the agent does those itself
        async def nope(*a, **k):
            raise NotImplementedError(name)
        return nope


async def _work(t: Talk) -> None:
    if os.environ.get("AUTOMATU_TALK_AGENT"):            # a stand-in agent, for tests: spends nothing
        cmd, env, meta = json.loads(os.environ["AUTOMATU_TALK_AGENT"]), None, {}
    else:
        cmd = env = meta = None
    if t.platform == "claude":
        sid, cwd, remove = copy_claude(t.conversation)
        if cmd is None:
            cmd = claude_adapter()
            env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}   # the user's login, never a key
            meta = {"claudeCode": {"options": {"settingSources": ["user", "project", "local"]}}}
    else:
        sid, remove = copy_agy(t.conversation)
        cwd = next((c["cwd"] for c in agy_conversations(t.repo) if c["id"] == t.conversation), "") or t.repo
        if not Path(cwd).is_dir():
            cwd = t.repo
        if cmd is None:
            cmd = agy_command(cwd)
    if not cwd or not Path(cwd).is_dir():
        cwd = t.repo
    client = _Client(t)
    try:
        async with spawn_agent_process(client, cmd[0], *cmd[1:], cwd=cwd, env=env) as (conn, proc):
            t._conn, t._session = conn, sid
            await asyncio.wait_for(conn.initialize(protocol_version=PROTOCOL_VERSION), 300)
            await asyncio.wait_for(conn.load_session(cwd=cwd, session_id=sid, mcp_servers=[], **meta), 300)
            t.state = "working"
            client.listening = True
            r = await conn.prompt(session_id=sid, prompt=[TextContentBlock(text=t.text)])
            end = "stopped" if r.stop_reason == "cancelled" else "done"
    finally:
        remove()
    # said only once the copy is gone: done means nothing is left behind
    t.state = end


def _thread(t: Talk) -> None:
    loop = asyncio.new_event_loop()
    t._loop = loop
    try:
        loop.run_until_complete(_work(t))
    except Exception as e:          # said on the hex, never raised into the page
        t.state, t.error = "failed", f"{type(e).__name__}: {e}"
    finally:
        t.ended = time.time()
        loop.close()


_TALKS: dict[str, Talk] = {}
_lock = threading.Lock()


def start(canvas: str, repo: str, platform: str, conversation: str, text: str) -> Talk:
    """The user's task, passed on: one at a time per canvas."""
    text = (text or "").strip()
    if not text:
        raise ValueError("write the task first")
    if platform not in ("claude", "antigravity"):
        raise ValueError("no agent app called " + repr(platform))
    with _lock:
        if any(x.canvas == canvas and x.live for x in _TALKS.values()):
            raise RuntimeError("a task is already running on this canvas")
        t = Talk(canvas, repo, platform, conversation, text[:20000])
        _TALKS[t.id] = t
    threading.Thread(target=_thread, args=(t,), name=t.id, daemon=True).start()
    return t


def get(talk_id: str) -> Talk | None:
    return _TALKS.get(talk_id)


def latest(canvas: str) -> Talk | None:
    ts = [t for t in _TALKS.values() if t.canvas == canvas]
    return max(ts, key=lambda t: t.started) if ts else None
