"""The map view's server, a FastAPI app: the page in web/, and the newest map
snapshots as JSON. On 127.0.0.1 only. Its API only reads (t-9b8317f00e); with the
watcher on it also makes new maps as the work happens (t-3e56993cc4).
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles

from .maps import latest_map, mapped_repos

WEB = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="AutomatU map view", docs_url=None, redoc_url=None, openapi_url=None)


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
    """The bound canvases, for the Main map (t-87c7947c95)."""
    from .views import canvases_view
    return canvases_view()


@app.get("/api/canvas-image")
def canvas_image_of(canvas: str, id: str) -> Response:
    """One image on a bound canvas, read where File Fabric keeps it (t-94fa849705).
    Only bound canvases serve images (t-8a3b5b9f93)."""
    from .binding import all_bindings
    from .sources.canvas import canvas_image
    if canvas not in {b["canvas"] for b in all_bindings()}:
        raise HTTPException(404, "not a canvas bound to a repository")
    try:
        got = canvas_image(canvas, id)
    except (OSError, ValueError, RuntimeError) as e:
        raise HTTPException(404, str(e))
    if not got:
        raise HTTPException(404, "no image with that id on this canvas")
    return Response(content=got[0], media_type=got[1])


@app.get("/api/relations")
def relations_of(canvas: str) -> dict:
    """Which boxes on a bound canvas are related, and why (t-5d0347338f)."""
    from .binding import all_bindings
    from .relations import relations
    if canvas not in {b["canvas"] for b in all_bindings()}:
        raise HTTPException(404, "not a canvas bound to a repository")
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


@app.get("/api/timeline")
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
