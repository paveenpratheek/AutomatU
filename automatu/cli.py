"""automatu - the command line.

  automatu bind <repo> <canvas> [--totem NAME] [--replace]
                                  bind a repository to the canvas that plans it,
                                  naming the totem that is the plan
  automatu sources <repo>         what AutomatU reads for it: regions, commits,
                                  thoughts, and the sections of its canvas
  automatu align <repo>           place its regions under the plan's sections
                                  and keep the map as a snapshot
  automatu calibrate [--write]    set the placement numbers on the Harness canvas
  automatu serve [--port 7790]    the map view on 127.0.0.1, making a new map on
                                  every commit or plan change (--no-watch to only show)
  automatu agent register|leave <repo> --agent NAME
                                  an agent answers for a repository, or steps down
  automatu agents                 who answers for which repository
  automatu notices [<repo>] [--refresh]
                                  the boxes the code has moved past, and work in progress
  automatu notices close ID --by NAME (--done | --still-right | --ignored) "what, or why"
                                  close a notice, saying what was done
  automatu mcp                    the MCP server over stdio, for agents on any platform (read-only)
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
    from .sources.canvas import read_canvas_script
    script = read_canvas_script(b["canvas"])
    plan = plan_sections(b, canvas.sections, script)
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
    from .notices import refresh
    n = refresh(m["repo"])
    print(f"notices: {n['added']} commits added, {n['closed']} closed by a tick - automatu notices to read them")


def _calibrate(a) -> None:
    from .calibrate import run
    run(write=a.write)


def _serve(a) -> None:
    from .serve import serve
    print(f"map view on http://127.0.0.1:{a.port}" + ("" if a.no_watch else ", making a new map on every commit or plan change") + "  (Ctrl+C to stop)")
    serve(port=a.port, watch=not a.no_watch)


def _agent(a) -> None:
    from .notices import leave, register
    if a.action == "register":
        r = register(a.agent, a.repo, a.note or "")
        print(f"{r['agent']} answers for {r['repo']} since {r['since']}" if r["changed"] else f"{r['agent']} already answers for {r['repo']}, since {r['since']}")
    else:
        r = leave(a.agent, a.repo, a.note or "")
        print(f"{r['agent']} no longer answers for {r['repo']}")


def _agents(a) -> None:
    from .notices import agents
    got = agents()
    if not got:
        print("no agent answers for a repository yet: automatu agent register <repo> --agent NAME")
    for g in got:
        print(g["agent"])
        for r in g["repos"]:
            print(f"  {r['name']}  since {r['since']}  {r['behind']} boxes behind, {r['progress']} in progress")


def _commit_line(c: dict) -> str:
    regs = "; ".join(f"{x['file']} {x['name']} {x['start']}-{x['end']}" for x in c["regions"])
    return f"      {c['sha'][:7]} {c['at'][:16].replace('T', ' ')} UTC  {c['state']}  {c['subject']}\n        {regs}"


def _notices(a) -> None:
    from .binding import repo_key
    from .notices import close_notice, notices, refresh
    if a.target and a.target[0] == "close":
        if len(a.target) < 2 or not a.target[1].isdigit():
            raise ValueError('automatu notices close ID --by NAME (--done | --still-right | --ignored) "what, or why"')
        how = [k for k, v in (("done", a.done), ("still-right", a.still_right), ("ignored", a.ignored)) if v is not None]
        if len(how) != 1:
            raise ValueError("say one of --done, --still-right or --ignored, with what was done or why")
        note = {"done": a.done, "still-right": a.still_right, "ignored": a.ignored}[how[0]]
        n = close_notice(int(a.target[1]), how[0], note, a.by or "")
        print(f"notice {n['id']} on {n['box']} closed as {n['closed_how']} by {n['closed_by']}: {n['closed_note']}")
        return
    repo = repo_key(a.target[0]) if a.target else None
    if a.refresh:
        from .binding import all_bindings
        for b in all_bindings():
            if repo is None or b["repo"] == repo:
                r = refresh(b["repo"])
                print(f"worked out again for {b['repo']}: {r['added']} commits added, {r['closed']} notices closed by a tick")
    n = notices(repo, closed=5)
    print(f"{n['count']} boxes behind their code")
    for title, rows in (("behind", n["behind"]), ("in progress", n["progress"])):
        for x in rows:
            print(f"  [{x['id']}] {x['name']} > {x['box'].split(' > ')[-1]}  ({title}: {x['behind']} behind, {x['progress']} in progress)")
            for c in x["commits"]:
                if c["state"] != "ticked":
                    print(_commit_line(c))
    if n["closed"]:
        print("closed lately:")
        for x in n["closed"]:
            print(f"  [{x['id']}] {x['name']} > {x['box'].split(' > ')[-1]}  {x['closed_how']} by {x['closed_by']}: {x['closed_note']}")


def _mcp(a) -> None:
    # stdout is the protocol from here on: nothing else may print to it.
    from .mcp_server import run
    run()


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
    v = sub.add_parser("serve", help="the map view, kept live")
    v.add_argument("--port", type=int, default=7790)
    v.add_argument("--no-watch", action="store_true", help="only show maps, do not make new ones")
    v.set_defaults(fn=_serve)
    g = sub.add_parser("agent", help="an agent answers for a repository, or steps down")
    g.add_argument("action", choices=("register", "leave")); g.add_argument("repo")
    g.add_argument("--agent", required=True, help="the agent's name, as it writes on the canvas")
    g.add_argument("--note", help="why, kept in the log")
    g.set_defaults(fn=_agent)
    sub.add_parser("agents", help="who answers for which repository").set_defaults(fn=_agents)
    n = sub.add_parser("notices", help="the boxes the code has moved past; close ID to close one")
    n.add_argument("target", nargs="*", help="a repository, or: close ID")
    n.add_argument("--refresh", action="store_true", help="work the notices out again first")
    n.add_argument("--by", help="who closes it")
    n.add_argument("--done", help="what was changed")
    n.add_argument("--still-right", dest="still_right", help="why the box's words still hold")
    n.add_argument("--ignored", help="closed because the user asked; say so")
    n.set_defaults(fn=_notices)
    sub.add_parser("mcp", help="AutomatU's MCP server over stdio, for agents on any platform (read-only)").set_defaults(fn=_mcp)
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
