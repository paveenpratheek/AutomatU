"""The map view's server, a FastAPI app: the page in web/, and the newest map
snapshots as JSON. On 127.0.0.1 only. Its API only reads (t-9b8317f00e), but for
what the user does on AutomatU's own page, and only from it: an Interrupt passed
on to a desk (t-5bb672b723), the canvases the user adds and removes (t-4fb5a8ff46), and the desks' workflows and grants the user
arranges, kept in AutomatU's store once the desk accepts them (t-d966145acd); and the agent the user places at a
desk, with its chat (t-e02af0ac56), each also an A2A agent under /a2a/<slug>; with the
watcher on it also makes new maps as the work happens (t-3e56993cc4). The
notices, agents and timeline answers are typed, and their schema is served at
/api/openapi.json for the page and other agents (t-e7dd1752e3).
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles

from .maps import latest_map, mapped_repos
from .models import (AgentsAnswer, ArrangementSave, CanvasAsk, CanvasChange, KdDeskAnswer, KdDeskChange, KdOverview, DeskRunDetail, DesksAnswer, GrantsSave, InterruptAnswer,
                     InterruptAsk, NoticesAnswer, SaveAnswer, Timeline, DeskAgentAnswer, DeskAgentChoose, DeskAgentItem,
                     DeskAgentSend, DeskAgentView)

WEB = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="AutomatU map view", docs_url=None, redoc_url=None, openapi_url="/api/openapi.json")


@app.get("/api/repos")
def repos() -> dict:
    return {"repos": mapped_repos()}


@app.get("/api/map")
def map_of(repo: str) -> dict:
    try:
        m = latest_map(repo)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not m:
        raise HTTPException(404, "no map for this repository yet: automatu align <repo>")
    return m


@app.get("/api/canvases")
def canvases() -> dict:
    """The canvases the user added, for the Main map (t-87c7947c95, box 24)."""
    from .views import canvases_view
    return canvases_view()


@app.get("/api/canvases/available")
def canvases_available() -> dict:
    """Every canvas NoteX has, each saying whether it is in AutomatU, for the
    Add canvas sheet (box 24, t-4fb5a8ff46)."""
    from .canvases import listing
    try:
        return listing()
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/canvases/add", response_model=CanvasChange)
def canvases_add(ask: CanvasAsk, request: Request) -> dict:
    """The user adds a canvas from CanvasX, through NoteX - from this page only."""
    _own_page(request, "add a canvas")
    from .canvases import add
    try:
        return add(ask.canvas)
    except (ValueError, RuntimeError) as e:
        return {"canvas": ask.canvas, "changed": False, "problem": str(e)}


@app.post("/api/canvases/remove", response_model=CanvasChange)
def canvases_remove(ask: CanvasAsk, request: Request) -> dict:
    """The user takes a canvas out of AutomatU - from this page only."""
    _own_page(request, "remove a canvas")
    from .canvases import remove
    try:
        return remove(ask.canvas)
    except ValueError as e:
        return {"canvas": ask.canvas, "changed": False, "problem": str(e)}


def _added(canvas: str) -> None:
    from .canvases import is_added
    if not is_added(canvas):
        raise HTTPException(404, "not a canvas in AutomatU")


@app.get("/api/canvas-image")
def canvas_image_of(canvas: str, id: str) -> Response:
    """One image on an added canvas, read where File Fabric keeps it (t-94fa849705).
    Only canvases in AutomatU serve images (t-8a3b5b9f93)."""
    from .sources.canvas import canvas_image
    _added(canvas)
    try:
        got = canvas_image(canvas, id)
    except (OSError, ValueError, RuntimeError) as e:
        raise HTTPException(404, str(e))
    if not got:
        raise HTTPException(404, "no image with that id on this canvas")
    return Response(content=got[0], media_type=got[1])


@app.get("/api/relations")
def relations_of(canvas: str) -> dict:
    """Which boxes on an added canvas are related, and why (t-5d0347338f)."""
    from .relations import relations
    _added(canvas)
    try:
        return relations(canvas)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/region-thoughts")
def region_thoughts(repo: str, region: str) -> dict:
    """One code region's thoughts as a graph (t-b2c1b5bfcc)."""
    from .binding import all_bindings
    from .thoughtnet import region_net
    from .views import _repo
    if repo not in {b["repo"] for b in all_bindings()}:
        raise HTTPException(404, "not a repository bound to a canvas")
    try:
        net = region_net(_repo(repo), region)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not net:
        raise HTTPException(404, "no such code region at HEAD")
    return net


@app.get("/api/code")
def code(repo: str, run: int | None = None) -> dict:
    """A repository's newest map - or, with run, an earlier one - with what the
    traffic search reads, for the Code map."""
    from .views import code_view
    try:
        v = code_view(repo, run)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not v:
        raise HTTPException(404, "no map for this repository yet: automatu align <repo>")
    return v


def _bound(repo: str) -> None:
    from .binding import all_bindings
    if repo not in {b["repo"] for b in all_bindings()}:
        raise HTTPException(404, "not a repository bound to a canvas")


@app.get("/api/timeline", response_model=Timeline)
def timeline_of(repo: str) -> dict:
    """A bound repository in time: its phases, plan versions, commits, thoughts
    and maps, and the boxes whose code moved on while their words did not
    (t-25f10ce5fd, t-e8ed35d743)."""
    from .timeline import timeline
    _bound(repo)
    try:
        return timeline(repo)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(503, str(e))


@app.get("/api/plan-at")
def plan_at_of(repo: str, when: str) -> dict:
    """The plan as it stood at a moment, and what the version before it said."""
    from .timeline import plan_at
    _bound(repo)
    try:
        return plan_at(repo, when)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/notices", response_model=NoticesAnswer)
def notices_of(repo: str | None = None) -> dict:
    """The boxes the code has moved past, work in progress, and the newest
    closed notices, for the bell (t-026702a111). Closing is an agent's
    command, never this API (t-9b8317f00e)."""
    from .notices import notices
    return notices(repo)


@app.get("/api/agents", response_model=AgentsAnswer)
def agents_of() -> dict:
    """The agents that answer for each repository, for the Agents button (t-268908a2b1)."""
    from .notices import agents
    return {"agents": agents()}


@app.get("/api/desks", response_model=DesksAnswer)
async def desks_of() -> dict:
    """Each Work Desks desk as its Agent Card, with the job and step it is on
    and what waits on the user, for the Agents tab (box 22, t-2b6d9b3541)."""
    from .desks import desks
    return {"desks": await desks()}


@app.get("/api/desks/run", response_model=DeskRunDetail)
async def desk_run(desk: str, task: str) -> dict:
    """One run of a desk, step by step, for the run view (box 21, t-2ddbfdabb6)."""
    from .desks import run
    r = await run(desk, task)
    if r is None:
        raise HTTPException(404, "no such run at a desk AutomatU lists")
    return r


@app.post("/api/desks/interrupt", response_model=InterruptAnswer)
async def interrupt_desk(ask: InterruptAsk, request: Request) -> dict:
    """The user's Interrupt button (box 23, t-5bb672b723): passed on to the
    desk, nothing decided here. Only AutomatU's own page may send it - a
    browser names the page a request comes from, and no other page is this."""
    _own_page(request, "interrupt an agent")
    from .desks import interrupt
    return await interrupt(ask.desk, ask.task)


def _own_page(request: Request, what: str) -> None:
    """A call that changes something is taken only from AutomatU's own page:
    a browser names the page a request comes from, and no other page is this."""
    origin, host = request.headers.get("origin"), request.headers.get("host", "")
    if origin not in (f"http://{host}", f"https://{host}"):
        raise HTTPException(403, f"only AutomatU's own page may {what}")


# ------------------------------------------------------------ the Knowledge Desk tab (box 25, t-8551b11d21)

@app.get("/api/kd", response_model=KdOverview)
async def kd_overview() -> dict:
    """The desks the user created with who sits at each, every tracked box, and
    what Knowledge Desk has indexed - read with AutomatU's token."""
    from .knowledge import overview
    return await overview()


@app.post("/api/kd/desks/{action}", response_model=KdDeskAnswer)
async def kd_desk_change(action: str, ask: KdDeskChange, request: Request) -> dict:
    """The user creates, changes or removes a desk - passed on to Knowledge
    Desk, which checks it; only from AutomatU's own page (t-d41a20184d)."""
    _own_page(request, "create, change or remove a desk")
    from .knowledge import change_desk
    return await change_desk(action, ask.model_dump(exclude_none=True))


@app.get("/api/kd/flows")
async def kd_flows(desk: str) -> dict:
    """A created desk's flows, steps, rules and runs, from Knowledge Desk (K5)."""
    from .knowledge import flows
    return await flows(desk)


@app.post("/api/kd/flows/save")
async def kd_flow_save(request: Request) -> dict:
    """The user saves a desk's flow - passed on to Knowledge Desk; only from AutomatU's own page."""
    _own_page(request, "save a flow")
    from .knowledge import save_flow
    b = await request.json()
    return await save_flow({"desk": str(b.get("desk") or ""), "name": str(b.get("name") or ""),
                            "steps": list(b.get("steps") or []), "note": str(b.get("note") or "")})


@app.post("/api/kd/runs/answer")
async def kd_run_answer(request: Request) -> dict:
    """The user's yes or no at a flow's stop - passed on; only from AutomatU's own page."""
    _own_page(request, "answer a flow's stop")
    from .knowledge import answer_run
    b = await request.json()
    return await answer_run(str(b.get("run") or ""), bool(b.get("yes")))


@app.get("/api/kd/ask")
async def kd_ask(q: str, only: str | None = "built") -> dict:
    """A question from the Ask section, put to Knowledge Desk over A2A: its
    cited sentences back, built work only unless the user turns that off."""
    from .knowledge import ask
    return await ask(q, "built" if only == "built" else None)


@app.get("/api/kd/monitoring")
async def kd_monitoring(desk: str | None = None) -> dict:
    """Each agent's traced calls at a desk, and the A2A tasks between desks (K6)."""
    from .knowledge import monitoring
    return await monitoring(desk)


# ------------------------------------------------------------ the desks' workflows (box 20, t-d966145acd)

@app.get("/api/workflows")
async def workflows_of(desk: str) -> dict:
    """What the Workflows editor needs for a desk: its steps, jobs, rules and
    grants, what the user arranged for it, and every version before."""
    from .workflows import DeskError, of
    try:
        return await of(desk)
    except DeskError as e:
        raise HTTPException(409, str(e))


@app.post("/api/workflows/save", response_model=SaveAnswer)
async def workflows_save(ask: ArrangementSave, request: Request) -> dict:
    _own_page(request, "save a workflow")
    from .workflows import DeskError, save
    try:
        return await save(ask.desk, ask.job, ask.steps, ask.note)
    except DeskError as e:
        return {"saved": False, "problems": [str(e)]}


@app.post("/api/workflows/grants", response_model=SaveAnswer)
async def workflows_grants(ask: GrantsSave, request: Request) -> dict:
    _own_page(request, "change what a desk may do")
    from .workflows import DeskError, save_grants
    try:
        return await save_grants(ask.desk, ask.writes, ask.asks)
    except DeskError as e:
        return {"saved": False, "problems": [str(e)]}


@app.get("/api/arrangements/current")
def arrangements_current(desk: str) -> dict:
    """What a desk reads at the start of each run: the newest arrangement of
    each of its jobs, and its newest grants (Work Desks box 14)."""
    from .workflows import current
    return current(desk)


# ------------------------------------------------------------ agents in AutomatU, one at each desk (box 30, t-e02af0ac56)

_desks_read: tuple[float, dict] | None = None


def _desk_of(canvas: str) -> dict | None:
    """The desk whose Main canvas this is, as Knowledge Desk serves it - or
    none, when it is not one or Knowledge Desk cannot say. What Knowledge Desk
    said is kept a few seconds, as the chat is read again every moment."""
    import asyncio
    import time
    from .knowledge import overview
    global _desks_read
    if _desks_read and time.monotonic() - _desks_read[0] < 5:
        ov = _desks_read[1]
    else:
        try:
            ov = asyncio.run(overview())
        except Exception:
            return None
        _desks_read = (time.monotonic(), ov)
    d = next((d for d in ov.get("desks") or [] if d.get("main_canvas") == canvas), None)
    return None if d is None else {"slug": d.get("slug") or "", "name": d.get("name") or "", "role": d.get("role") or "",
                                   "main_canvas": canvas, "attached": list(d.get("attached") or []),
                                   "owner": d.get("owner") or ""}


def _desk_agent(canvas: str):
    """The desk of this canvas, and AutomatU's agents; the desk as it was when
    its agent was chosen, when Knowledge Desk cannot say now."""
    from .desk_agents import MANAGER, chosen
    from .store import db
    desk = _desk_of(canvas)
    if desk is None:
        r = db().execute("SELECT desk FROM desk_agent WHERE canvas=%s AND detached_at IS NULL", (canvas,)).fetchone()
        rec = chosen(r[0]) if r else None
        if rec is None:
            raise HTTPException(404, "this canvas is no desk's Main canvas")
        desk = {"slug": rec["desk"], "name": rec["name"], "main_canvas": canvas}
    return desk, MANAGER


@app.get("/api/desk-agents", response_model=DeskAgentView)
def desk_agent_view(canvas: str) -> dict:
    """What the Agents button on a canvas's hex opens: the agent placed at the
    desk whose Main canvas it is - or the choice of one - and the desk's chat."""
    from .desk_agents import ELSEWHERE, MANAGER, messages, missing, models, said_by
    if missing():
        return {"canvas": canvas, "note": missing()}
    if not MANAGER.holds():
        return {"canvas": canvas, "note": ELSEWHERE}
    try:
        desk, m = _desk_agent(canvas)
    except HTTPException:
        return {"canvas": canvas, "note": "This canvas is no desk's Main canvas. Create a desk for it in the "
                                          "Knowledge Desk tab, and an agent can be placed at it here."}
    m.refresh(desk)
    from .binding import all_bindings
    repo = next((b["repo"] for b in all_bindings() if b["canvas"] == canvas), "")
    names = {s: a.desk["name"] for s, a in m.agents.items()} | {desk["slug"]: desk["name"]}
    msgs = [{**x, "by": said_by(x["who"], names)} for x in messages(desk["slug"])]
    return {"canvas": canvas, "desk": desk, "agent": m.now(desk["slug"]), "messages": msgs,
            "models": models(), "folder": repo}


def _taken(fn, *args):
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.post("/api/desk-agents/choose", response_model=DeskAgentView)
def desk_agent_choose(ask: DeskAgentChoose, request: Request) -> dict:
    """The user places an agent at the desk: agy or Claude, its model, and the
    folder it works in - only from AutomatU's own page."""
    _own_page(request, "place an agent at a desk")
    desk = _desk_of(ask.canvas)
    if desk is None:
        raise HTTPException(409, "Knowledge Desk does not say this canvas is a desk's Main canvas")
    from .desk_agents import MANAGER
    _taken(MANAGER.choose, desk, ask.agent, ask.model, ask.folder)
    return desk_agent_view(ask.canvas)


@app.post("/api/desk-agents/send", response_model=DeskAgentView)
def desk_agent_send(ask: DeskAgentSend, request: Request) -> dict:
    """The user's message to the desk's agent: worked on now, or queued."""
    _own_page(request, "give an agent work")
    desk, m = _desk_agent(ask.canvas)
    _taken(m.give, desk["slug"], "user", ask.text)
    return desk_agent_view(ask.canvas)


@app.post("/api/desk-agents/answer", response_model=DeskAgentView)
def desk_agent_answer(ask: DeskAgentAnswer, request: Request) -> dict:
    """The user's yes or no to a permission the agent asked for in the chat."""
    _own_page(request, "answer an agent")
    desk, m = _desk_agent(ask.canvas)
    if not m.answer(desk["slug"], ask.ask, ask.allow):
        raise HTTPException(409, "the agent is not waiting on that")
    return desk_agent_view(ask.canvas)


@app.post("/api/desk-agents/take-back", response_model=DeskAgentView)
def desk_agent_take_back(ask: DeskAgentItem, request: Request) -> dict:
    _own_page(request, "take a message back")
    desk, m = _desk_agent(ask.canvas)
    if ask.item is None or not m.take_back(desk["slug"], ask.item):
        raise HTTPException(409, "that message is not waiting in the queue")
    return desk_agent_view(ask.canvas)


@app.post("/api/desk-agents/stop", response_model=DeskAgentView)
def desk_agent_stop(ask: DeskAgentItem, request: Request) -> dict:
    _own_page(request, "stop an agent")
    desk, m = _desk_agent(ask.canvas)
    m.stop(desk["slug"])
    return desk_agent_view(ask.canvas)


@app.post("/api/desk-agents/detach", response_model=DeskAgentView)
def desk_agent_detach(ask: DeskAgentItem, request: Request) -> dict:
    """The user takes the agent off the desk: its process goes, with what it started."""
    _own_page(request, "detach an agent")
    desk, m = _desk_agent(ask.canvas)
    if not m.detach(desk["slug"]):
        raise HTTPException(409, "no agent is at this desk")
    return desk_agent_view(ask.canvas)


@app.get("/api/desk-agents/cards")
def desk_agent_cards() -> dict:
    """The agents placed at desks, for Work Desks to list beside its own: each
    an A2A agent at /a2a/<slug>, its card at /a2a/<slug>/.well-known/agent-card.json."""
    from .desk_agents import MANAGER
    return {"agents": MANAGER.cards()}


@app.middleware("http")
async def no_cache(request, call_next):
    res = await call_next(request)
    res.headers["cache-control"] = "no-cache"
    res.headers["x-content-type-options"] = "nosniff"
    return res


from .desk_agents import A2AMount  # noqa: E402

app.mount("/a2a", A2AMount(), name="a2a")
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def _restore_agents() -> None:
    """The agents placed at desks before AutomatU last stopped, placed again -
    by the one AutomatU that runs them (t-9ac895056e)."""
    import asyncio
    import threading
    try:
        from .desk_agents import MANAGER, models
        from .knowledge import overview

        def read() -> list[dict] | None:
            try:
                ds = asyncio.run(overview()).get("desks") or []
            except Exception:
                return None
            return [{"slug": d.get("slug") or "", "name": d.get("name") or "", "role": d.get("role") or "",
                     "main_canvas": d.get("main_canvas") or "", "attached": list(d.get("attached") or []),
                     "owner": d.get("owner") or ""} for d in ds]
        threading.Thread(target=models, name="agy-models", daemon=True).start()   # read once, before anyone asks
        desks = read()
        MANAGER.restore(desks or [])
        if desks is None and MANAGER.agents:
            # Knowledge Desk not answering yet: the agents were placed from
            # AutomatU's record alone; their roles follow once it answers.
            def later():
                import time
                for _ in range(120):
                    time.sleep(15)
                    got = read()
                    if got is not None:
                        for d in got:
                            MANAGER.refresh(d)
                        return
            threading.Thread(target=later, name="desk-roles", daemon=True).start()
    except Exception as e:          # the store or Work Desks missing: no agents, said on their hexes
        print(f"desk agents not restored: {type(e).__name__}: {e}")


def serve(port: int = 7790, watch: bool = True, every: float = 4.0) -> None:
    import uvicorn
    watcher = None
    if watch:
        # The live map: new maps are made as the work happens (t-5b98c27370).
        from .watch import Watcher
        watcher = Watcher(every=every)
        watcher.start()
    from . import desk_agents
    desk_agents.PORT = port
    _restore_agents()
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    finally:
        # Closing AutomatU takes every desk's agent off, with what it started (t-232d5f3a9a).
        desk_agents.MANAGER.close_all()
        if watcher:
            watcher.stop()
