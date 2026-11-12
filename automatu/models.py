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


# ------------------------------------------------------------- the desks, as their cards

class DeskSkill(BaseModel):
    id: str
    name: str
    description: str = ""
    examples: list[str] = []


class DeskCard(BaseModel):
    """What a desk's A2A Agent Card says it is and does."""
    name: str
    description: str = ""
    version: str = ""
    skills: list[DeskSkill] = []


class DeskStep(BaseModel):
    step: str
    actor: str           # code, the agent or the user
    status: str
    started_at: str = ""


class DeskRun(BaseModel):
    task_id: str
    job: str
    state: str
    work: str | None = None
    started_at: str = ""
    step: DeskStep | None = None


class DeskAsk(BaseModel):
    """A permission ask or a question waiting on the user."""
    task_id: str
    kind: str
    text: str
    job: str | None = None
    asked_at: str = ""


class DeskLive(BaseModel):
    agent: str | None = None
    model: str | None = None
    runs: list[DeskRun] = []
    waiting: list[DeskAsk] = []


class DeskRecent(BaseModel):
    """A run lately, finished or not: for the bell and the history (box 21)."""
    task_id: str
    job: str
    state: str           # running, waiting, completed, failed, cancelled
    started_at: str = ""
    ended_at: str = ""
    said: str = ""


class DeskTracked(BaseModel):
    """A box a desk tracks, as Knowledge Desk serves it (K4): same, changed or
    gone since the desk's agent read it (t-e8412b6296)."""
    desk: str
    desk_name: str = ""
    hex: str
    address: str = ""
    canvas: str = ""
    state: str           # same, changed, gone
    read_at: str = ""


class Desk(BaseModel):
    url: str
    up: bool
    card: DeskCard | None = None
    live: DeskLive | None = None
    recent: list[DeskRecent] = []
    tracking: list[DeskTracked] = []
    note: str = ""


class KdSitter(BaseModel):
    sitting: int
    desk: str
    agent: str
    client: str = ""
    since: str | None = None
    last_seen: str | None = None
    away: bool = False


class KdDesk(BaseModel):
    """A desk the user created, as Knowledge Desk keeps it (box 25)."""
    slug: str
    version: int
    name: str
    role: str
    owner: str
    main_canvas: str
    attached: list[str] = []
    created_at: str | None = None
    changed_at: str | None = None
    sitting: list[KdSitter] = []


class KdCanvas(BaseModel):
    canvas: str
    boxes: int
    updated_at: str


class KdOverview(BaseModel):
    """What the Knowledge Desk tab shows: the desks, every tracked box, the index."""
    url: str
    up: bool
    note: str = ""
    desks: list[KdDesk] = []
    tracking: list[DeskTracked] = []
    canvases: list[KdCanvas] = []


class KdDeskChange(BaseModel):
    """Create, change or remove a desk, from AutomatU's own page."""
    desk: str | None = None
    name: str | None = None
    role: str | None = None
    main_canvas: str | None = None
    attached: list[str] | None = None
    owner: str | None = None


class KdDeskAnswer(BaseModel):
    done: bool
    desk: str | None = None
    version: int | None = None
    problem: str | None = None


class DeskRunStep(BaseModel):
    """One step of a run as the desk recorded it: who did it, how it ended,
    and what it cited, recorded, made or asked (box 21, t-2ddbfdabb6)."""
    step: str
    actor: str
    status: str          # running, done, problems, waiting, failed, interrupted
    started_at: str = ""
    ended_at: str = ""
    tries: int | None = None
    detail: dict = {}


class DeskRunAsk(BaseModel):
    kind: str            # question, permission, interrupt
    text: str
    asked_at: str = ""
    answered_at: str = ""
    answer: str = ""


class DeskRunDetail(BaseModel):
    """/api/desks/run: one run, step by step, with everything it asked."""
    desk: str
    task_id: str
    job: str
    state: str
    started_at: str = ""
    ended_at: str = ""
    said: str = ""
    steps: list[DeskRunStep] = []
    asks: list[DeskRunAsk] = []


class DesksAnswer(BaseModel):
    """/api/desks: each desk as its Agent Card, with what it is doing and what
    waits on the user (box 22, t-2b6d9b3541). Read only: AutomatU answers nothing."""
    desks: list[Desk]


class ArrangementSave(BaseModel):
    """The editor's Save: a job's steps for a desk (box 20, t-d966145acd)."""
    desk: str
    job: str
    steps: list[dict]
    note: str = ""


class GrantsSave(BaseModel):
    """The editor's grants for a desk: canvases its agent may write, desks it may ask (t-7d4389282b)."""
    desk: str
    writes: list[str] = []
    asks: list[str] = []


class SaveAnswer(BaseModel):
    saved: bool
    version: int | None = None
    problems: list[str] = []


class InterruptAsk(BaseModel):
    """The user's interrupt from the Agents tab: which desk, which task (box 23)."""
    desk: str
    task: str


class InterruptAnswer(BaseModel):
    """What the desk said to the user's interrupt: whether it stopped, and why not."""
    interrupted: bool
    why: str = ""


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


# ------------------------------------------------------------- what an agent can ask (the MCP server, t-5fece0836c)

class StackCommit(BaseModel):
    sha: str
    subject: str


class StackRegion(BaseModel):
    """A code region placed under a box on the newest map."""
    id: str
    file: str
    name: str
    start: int
    end: int
    commits: list[StackCommit]


class RelatedBox(BaseModel):
    box: str
    by: str  # code, link or meaning
    why: list[str]


class Decision(BaseModel):
    """A thought the box's words or its code carry, as GitX holds it - and the
    later thought that superseded it, if one did, so no reader takes it for how
    things are now (t-5df729e232)."""
    id: str
    kind: str | None
    outcome: str | None
    settled_in: str
    text: str
    superseded_by: str | None = None


class Hex(BaseModel):
    """A box's lasting place: its canvas, its totem by the totem's lasting id,
    and the box (t-112509dee9). `ref` is how an agent cites it."""
    ref: str            # h:<canvas>/<totem id, or its name when it has none>/<box>
    canvas: str
    totem_id: str | None
    totem: str | None
    box: str
    address: str


class MapRef(BaseModel):
    """The map a bound repository's code is as of."""
    repo: str
    run: int
    made_at: str
    head: str


class BoxContext(BaseModel):
    """Everything AutomatU knows about one box, read where it lives."""
    canvas: str
    address: str
    name: str
    words: str
    built_by: list[str]  # the commits named on its [x] lines
    plans: list[str]  # the repositories whose plan this box is in
    stack: list[StackRegion]
    stack_more: int  # regions under it beyond those listed
    related: list[RelatedBox]
    decisions: list[Decision]
    behind: Drift | None
    note: str
    hex: Hex | None = None
    maps: list[MapRef] = []


class FoundBox(BaseModel):
    canvas: str
    address: str
    name: str
    score: float
    words: str
    hex: Hex | None = None


class ShelfBox(BaseModel):
    """One box on the shelf, with all that stands with it."""
    hex: Hex
    name: str
    words: str
    built_by: list[str]
    plans: list[str]
    regions: list[StackRegion]
    regions_more: int
    decisions: list[Decision]
    # The repositories whose plan totem holds this box, built or not: with no
    # ticked commit and no code under it, a box in a plan is still a plan
    # (t-0881cc76fe).
    in_plan: list[str] = []


class ShelfAnswer(BaseModel):
    """Every box of one canvas with its hex location (t-07b5e52886)."""
    canvas: str
    maps: list[MapRef]
    boxes: list[ShelfBox]
    note: str


class AddedCanvas(BaseModel):
    """One canvas the user added to AutomatU (box 24)."""
    canvas: str
    added_at: str
    repos: list[str]


class CanvasesAnswer(BaseModel):
    """The canvases in AutomatU - the only ones it answers about."""
    canvases: list[AddedCanvas]
    note: str


class CanvasAsk(BaseModel):
    """Add or remove one canvas, from AutomatU's own page."""
    canvas: str


class CanvasChange(BaseModel):
    canvas: str
    changed: bool
    problem: str | None = None


class FindAnswer(BaseModel):
    query: str
    boxes: list[FoundBox]


class SinceWrite(BaseModel):
    at: str
    by: str
    totems: list[str]


class SinceRepo(BaseModel):
    repo: str
    canvas: str
    commits: list[TimelineCommit]
    plan_writes: list[SinceWrite]
    maps: int


class SinceAnswer(BaseModel):
    """What changed since a moment, so an agent on another platform can catch up."""
    since: str
    repos: list[SinceRepo]
    notices_opened: list[Notice]
    notices_closed: list[Notice]


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
