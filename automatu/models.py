"""The shapes of what AutomatU keeps and serves, as Pydantic models
(t-e7dd1752e3): a notice's commits, checked before a row is written; the
answers of /api/notices, /api/agents and /api/timeline, whose schema is
served at /api/openapi.json; and calibration.json, checked when it is loaded.

What AutomatU writes is checked strictly - an unknown or misspelled field is
refused, named. What it serves is typed as it goes out. The answer key's
shape is not here: it lives with the scorer, beside the key, outside the
repository, so AutomatU's code never knows the key (t-de773189d5).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SHA = r"^[0-9a-f]{7,40}$"
UTC = r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$"  # the store's clock: ISO, in UTC, ending in Z


class Strict(BaseModel):
    """Refuses a field it does not know, so a misspelling fails where it is made."""
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------- notices

class RegionRef(Strict):
    """A code region a commit changed, as it stood at the map the notice was made from."""
    id: str = Field(min_length=1)
    file: str = Field(min_length=1)
    name: str
    start: int = Field(ge=1)
    end: int = Field(ge=1)

    @model_validator(mode="after")
    def _lines_in_order(self) -> RegionRef:
        if self.end < self.start:
            raise ValueError(f"region {self.id} ends at line {self.end}, before it starts at {self.start}")
        return self


class NoticeCommit(Strict):
    """One commit a box is behind, or holds in progress (t-3f31f11ef2)."""
    sha: str = Field(pattern=SHA)
    at: str = Field(pattern=UTC)
    subject: str
    state: Literal["behind", "progress", "ticked"]
    ticked_by: str | None = Field(default=None, pattern=SHA)
    regions: list[RegionRef] = Field(min_length=1)


class Notice(BaseModel):
    id: int
    repo: str
    name: str
    box: str
    status: Literal["open", "closed"]
    opened_at: str
    updated_at: str
    commits: list[NoticeCommit]
    closed_at: str | None
    closed_by: str | None
    closed_how: Literal["done", "still-right", "ignored", "ticked"] | None
    closed_note: str
    behind: int = Field(ge=0)
    progress: int = Field(ge=0)


class NoticesAnswer(BaseModel):
    """/api/notices: the bell's count, the boxes behind, work in progress, the newest closed."""
    count: int = Field(ge=0)
    behind: list[Notice]
    progress: list[Notice]
    closed: list[Notice]


# ------------------------------------------------------------- agents

class AgentRepo(BaseModel):
    repo: str
    name: str
    since: str
    note: str
    behind: int = Field(ge=0)
    progress: int = Field(ge=0)


class Agent(BaseModel):
    agent: str
    repos: list[AgentRepo]


class AgentsAnswer(BaseModel):
    """/api/agents: who answers for which repository (t-268908a2b1)."""
    agents: list[Agent]


# ------------------------------------------------------------- the timeline

class Phase(BaseModel):
    canvas: str
    totem: str | None
    start: str
    end: str | None
    rebuilt: bool
    note: str
    versions: list[str]
    commits: int
    thoughts: int
    settled: int
    maps: int


class TimelineCommit(BaseModel):
    sha: str
    at: str
    subject: str


class TimelineThought(BaseModel):
    id: str
    at: str
    kind: str | None
    outcome: str | None
    settled: str
    text: str


class TimelineMap(BaseModel):
    id: int
    at: str
    head: str
    placed: int
    regions: int


class Drift(BaseModel):
    """A box's open notice, as the Code map's panels show it."""
    id: int
    box: str
    behind: int
    progress: int
    commits: list[NoticeCommit]


class Timeline(BaseModel):
    """/api/timeline: a bound repository in time (t-25f10ce5fd)."""
    repo: str
    canvas: str
    now: str
    phases: list[Phase]
    commits: list[TimelineCommit]
    thoughts: list[TimelineThought]
    maps: list[TimelineMap]
    drift: list[Drift]


# ------------------------------------------------------------- calibration.json

class CalibrationResult(Strict):
    known: int = Field(ge=0)
    placed: int = Field(ge=0)
    shared: int = Field(ge=0)
    placements: int = Field(ge=0)
    correct: int = Field(ge=0)
    wrong: int = Field(ge=0)
    precision: float = Field(ge=0, le=1)
    coverage: float = Field(ge=0, le=1)
    top1: float = Field(ge=0, le=1)


class SelfTest(Strict):
    """The pass mark for AutomatU's own code, fixed before it runs (t-318ebf8e44)."""
    minPrecision: float = Field(ge=0, le=1)
    minCoverage: float = Field(ge=0, le=1)
    truth: str


class Calibration(Strict):
    """calibration.json: the placement numbers and how they were found."""
    made: str
    model: str
    canvas: str
    repos: dict[str, str]
    wrongCost: float = Field(gt=0)
    minScore: float = Field(ge=-1, le=1)
    minMargin: float = Field(ge=0)
    overlap: float = Field(default=0, ge=0)
    maxShared: int = Field(default=3, ge=1)
    result: CalibrationResult
    selfTest: SelfTest
