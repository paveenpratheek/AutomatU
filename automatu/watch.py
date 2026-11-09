"""The live map's watcher: while the map view runs, it looks at every bound
repository every few seconds and makes a new map when there is a new commit or
the plan's boxes changed (t-5b98c27370), then works out again which built
boxes the code has moved past (notices.py, t-5f4103c65a). It writes only
AutomatU's own map snapshots and notices - never GitX, the repository or the
canvas (t-3e56993cc4).
"""
from __future__ import annotations

import threading
import time

from .binding import all_bindings
from .maps import make_map, needs_map
from .notices import refresh
from .store import close


class Watcher(threading.Thread):
    def __init__(self, every: float = 4.0, log=print):
        super().__init__(name="automatu-watcher", daemon=True)
        self.every = every
        self.log = log
        self.stopped = threading.Event()
        self.last_error: dict[str, str] = {}
        self.noticed: set[str] = set()  # repositories whose notices were worked out since this watcher started

    def check_once(self) -> list[dict]:
        """One look at every bound repository; returns the maps it made."""
        made = []
        for b in all_bindings():
            try:
                why = needs_map(b)
                if not why:
                    if b["repo"] not in self.noticed:
                        self.notice(b["repo"])
                    self.last_error.pop(b["repo"], None)
                    continue
                t0 = time.time()
                m = make_map(b["repo"])
                self.log(f"new map {m['run']} for {m['repo']} ({why}): {m['placed']} of {m['regions']} placed, {time.time() - t0:.1f} s")
                made.append(m)
                self.notice(b["repo"])
                self.last_error.pop(b["repo"], None)
            except Exception as e:  # one repository failing must not stop the others
                msg = f"{type(e).__name__}: {e}"
                if self.last_error.get(b["repo"]) != msg:  # say it once, not every few seconds
                    self.log(f"could not check {b['repo']}: {msg}")
                self.last_error[b["repo"]] = msg
        return made

    def notice(self, repo: str) -> None:
        """Notices after a new map; a failure is said and never stops the map."""
        self.noticed.add(repo)
        try:
            n = refresh(repo)
            if n["added"] or n["closed"]:
                self.log(f"notices for {repo}: {n['added']} commits added, {n['closed']} closed by a tick")
        except Exception as e:
            self.log(f"could not work out the notices for {repo}: {type(e).__name__}: {e}")

    def run(self) -> None:
        try:
            while not self.stopped.is_set():
                self.check_once()
                self.stopped.wait(self.every)
        finally:
            close()

    def stop(self) -> None:
        self.stopped.set()
