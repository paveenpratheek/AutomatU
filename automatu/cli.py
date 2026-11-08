"""automatu - the command line.

  automatu bind <repo> <canvas> [--totem NAME] [--replace]
                                  bind a repository to the canvas that plans it,
                                  naming the totem that is the plan
  automatu sources <repo>         what AutomatU reads for it: regions, commits,
                                  thoughts, and the sections of its canvas
  automatu align <repo>           place its regions under the plan's sections
                                  and keep the map as a snapshot
  automatu calibrate [--write]    set the placement numbers on the Harness canvas
  automatu serve [--port 7790]    the map view, on 127.0.0.1
"""
from __future__ import annotations

import argparse
import sys

from .store import close, migrate


def _bind(a) -> None:
    from .binding import bind
    r = bind(a.repo, a.canvas, totem=a.totem, replace=a.replace)
    where = r["canvas"] + (" > " + r["totem"] if r["totem"] else "")
    if r["changed"]:
        print(f"bound {r['repo']} to {where}" + (f" (was {r['was']})" if r.get("was") else ""))
    else:
        print(f"{r['repo']} is already bound to {where}")


def _sources(a) -> None:
    from .binding import binding_of, plan_sections, repo_key
    from .sources.canvas import read_canvas
    from .sources.gitx import read_repo
    repo = read_repo(repo_key(a.repo))
    with_thoughts = sum(1 for r in repo.regions if r.thoughts)
    print(f"{repo.dir} at {repo.head}: {len(repo.regions)} regions ({with_thoughts} with linked thoughts), "
          f"{len(repo.commits)} commits, {len(repo.thoughts)} thoughts")
    b = binding_of(a.repo)
    if not b:
        print("not bound to a canvas yet: automatu bind <repo> <canvas>")
        return
    canvas = read_canvas(b["canvas"])
    plan = plan_sections(b, canvas.sections)
    print(f"canvas {b['canvas']}: {len(canvas.sections)} sections, {len(plan)} in the plan" + (f" ({b['totem']})" if b["totem"] else ""))
    for s in plan:
        print("  " + s.address)


def _align(a) -> None:
    from .maps import make_map
    m = make_map(a.repo)
    print(f"map {m['run']}: {m['repo']} at {m['head']} on {m['canvas']} - {m['placed']} of {m['regions']} regions placed, "
          f"{m['regions'] - m['placed']} not yet placed")
    count: dict[str, int] = {}
    for p in m["places"]:
        for s in p.sections:
            count[s] = count.get(s, 0) + 1
    for s in m["sections"]:
        print(f"  {count.get(s, 0):4d}  {s}")
    shared = sum(1 for p in m["places"] if len(p.sections) > 1)
    if shared:
        print(f"  {shared} of the placed regions sit in more than one section")


def _calibrate(a) -> None:
    from .calibrate import run
    run(write=a.write)


def _serve(a) -> None:
    from .serve import serve
    print(f"map view on http://127.0.0.1:{a.port}  (Ctrl+C to stop)")
    serve(port=a.port)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="automatu", description="Brings a project's sources together and aligns its code under its plan.")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("bind", help="bind a repository to the canvas that plans it")
    b.add_argument("repo"); b.add_argument("canvas")
    b.add_argument("--totem", help="the totem on the canvas that is the plan")
    b.add_argument("--replace", action="store_true", help="change an existing binding")
    b.set_defaults(fn=_bind)
    s = sub.add_parser("sources", help="what AutomatU reads for a repository"); s.add_argument("repo"); s.set_defaults(fn=_sources)
    al = sub.add_parser("align", help="place a repository's regions under its plan"); al.add_argument("repo"); al.set_defaults(fn=_align)
    c = sub.add_parser("calibrate", help="set the placement numbers on the Harness canvas")
    c.add_argument("--write", action="store_true", help="write calibration.json"); c.set_defaults(fn=_calibrate)
    v = sub.add_parser("serve", help="the map view"); v.add_argument("--port", type=int, default=7790); v.set_defaults(fn=_serve)
    a = p.parse_args(argv)
    try:
        migrate()
        a.fn(a)
        return 0
    except (RuntimeError, ValueError) as e:
        print("automatu: " + str(e), file=sys.stderr)
        return 1
    finally:
        close()


if __name__ == "__main__":
    sys.exit(main())
