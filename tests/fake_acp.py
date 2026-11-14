"""A stand-in for the agent a hex talks to: an ACP agent over stdio that loads
any conversation it is given and spends nothing of the user's allowance.

Scripted by the task's text, one command per line:

  SAY <text>       reply with this text
  TOOL <title>     report a tool call starting and finishing
  ASK <title>      ask permission (allow, always, deny); say "allowed <option>"
                   or "refused"
  WHERE            say the folder and the conversation it was loaded with
  SLOW <seconds>   wait, so a task can be stopped
"""
from __future__ import annotations

import asyncio
import uuid

from acp import PROTOCOL_VERSION, run_agent
from acp.schema import (AgentCapabilities, AgentMessageChunk, AllowedOutcome, Implementation, InitializeResponse,
                        LoadSessionResponse, PermissionOption, PromptResponse, TextContentBlock, ToolCallProgress,
                        ToolCallStart, ToolCallUpdate)


class Fake:
    def __init__(self):
        self.conn = None
        self.loaded: dict[str, str] = {}
        self.cancelled: set[str] = set()

    def on_connect(self, conn):
        self.conn = conn

    async def initialize(self, protocol_version, client_capabilities=None, client_info=None, **kw):
        return InitializeResponse(protocol_version=PROTOCOL_VERSION, agent_capabilities=AgentCapabilities(load_session=True),
                                  agent_info=Implementation(name="Fake agent", version="0.0.1"))

    async def load_session(self, cwd, session_id, mcp_servers=None, additional_directories=None, **kw):
        self.loaded[session_id] = cwd
        # a loaded conversation replays an old turn: the hex must not show it
        await self.say(session_id, "an old turn, replayed")
        return LoadSessionResponse()

    async def cancel(self, session_id, **kw):
        self.cancelled.add(session_id)

    async def say(self, sid, text):
        await self.conn.session_update(sid, AgentMessageChunk(content=TextContentBlock(text=text)))

    async def prompt(self, session_id, prompt, **kw):
        text = "\n".join(getattr(b, "text", "") for b in prompt)
        for line in text.splitlines():
            cmd, _, arg = line.strip().partition(" ")
            if session_id in self.cancelled:
                return PromptResponse(stop_reason="cancelled")
            if cmd == "SAY":
                await self.say(session_id, arg)
            elif cmd == "TOOL":
                tid = "call-" + uuid.uuid4().hex[:6]
                await self.conn.session_update(session_id, ToolCallStart(tool_call_id=tid, title=arg, status="in_progress"))
                await self.conn.session_update(session_id, ToolCallProgress(tool_call_id=tid, status="completed"))
            elif cmd == "ASK":
                r = await self.conn.request_permission(
                    session_id, ToolCallUpdate(tool_call_id="call-" + uuid.uuid4().hex[:6], title=arg, status="pending"),
                    [PermissionOption(option_id="allow", name="Allow once", kind="allow_once"),
                     PermissionOption(option_id="always", name="Always allow", kind="allow_always"),
                     PermissionOption(option_id="deny", name="Deny", kind="reject_once")])
                if isinstance(r.outcome, AllowedOutcome) and r.outcome.option_id != "deny":
                    await self.say(session_id, "allowed " + r.outcome.option_id)
                else:
                    await self.say(session_id, "refused")
            elif cmd == "WHERE":
                await self.say(session_id, f"in {self.loaded.get(session_id)} as {session_id}")
            elif cmd == "SLOW":
                for _ in range(int(float(arg or 1) * 10)):
                    await asyncio.sleep(0.1)
                    if session_id in self.cancelled:
                        return PromptResponse(stop_reason="cancelled")
        return PromptResponse(stop_reason="end_turn")


if __name__ == "__main__":
    asyncio.run(run_agent(Fake()))
