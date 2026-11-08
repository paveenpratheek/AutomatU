"""The live map's watcher: while the map view runs, it looks at every bound
repository every few seconds and makes a new map when there is a new commit or
the plan's boxes changed (t-5b98c27370). It writes only AutomatU's own map
snapshots - never GitX, the repository or the canvas (t-3e56993cc4).
"""
from __future__ import annotations

import threading
import time

from .binding import all_bindings
from .maps import make_map, needs_map
from .store import close


class Watcher(threading.Thread):
    def __init__(self, every: float = 4.0, log=print):
        super().__init__(name="automatu-watcher", daemon=True)
        self.every = every
        self.log = log
        self.stopped = threading.Event()
        self.last_error: dict[str, str] = {}

    def check_once(self) -> list[dict]:
        """One look at every bound repository; returns the maps it made."""
        made = []
        for b in all_bindings():
            try:
                why = needs_map(b)
                if not why:
                    self.last_error.pop(b["repo"], None)
                    continue
                t0 = time.time()
                m = make_map(b["repo"])
                self.log(f"new map {m['run']} for {m['repo']} ({why}): {m['placed']} of {m['regions']} placed, {time.time() - t0:.1f} s")
                made.append(m)
                self.last_error.pop(b["repo"], None)
            except Exception as e:  # one repository failing must not stop the others
                msg = f"{type(e).__name__}: {e}"
                if self.last_error.get(b["repo"]) != msg:  # say it once, not every few seconds
                    self.log(f"could not check {b['repo']}: {msg}")
                self.last_error[b["repo"]] = msg
        return made

    def run(self) -> None:
        try:
            while not self.stopped.is_set():
                self.check_once()
                self.stopped.wait(self.every)
        finally:
            close()

    def stop(self) -> None:
        self.stopped.set()
