"""The map view's server, a FastAPI app: the page in web/, and the newest map
snapshots as JSON. On 127.0.0.1 only. Its API only reads (t-9b8317f00e), but for
what the user does on AutomatU's own page, and only from it: an Interrupt passed
on to a desk (t-5bb672b723), the canvases the user adds and removes (t-4fb5a8ff46), and the desks' workflows and grants the user
arranges, kept in AutomatU's store once the desk accepts them (t-d966145acd); with the
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
                     InterruptAsk, NoticesAnswer, SaveAnswer, Timeline)

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


@app.middleware("http")
async def no_cache(request, call_next):
    res = await call_next(request)
    res.headers["cache-control"] = "no-cache"
    res.headers["x-content-type-options"] = "nosniff"
    return res


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def serve(port: int = 7790, watch: bool = True, every: float = 4.0) -> None:
    import uvicorn
    watcher = None
    if watch:
        # The live map: new maps are made as the work happens (t-5b98c27370).
        from .watch import Watcher
        watcher = Watcher(every=every)
        watcher.start()
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    finally:
        if watcher:
            watcher.stop()
