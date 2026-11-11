# Project AutomatU - read this first

AutomatU keeps a project's plan and its code lined up. It reads a repository's
code regions, commits and thoughts through **GitX**, reads the canvas that plans
the project through **NoteX**, places each piece of code under the plan box it
does, and shows it all as hexagon maps. It is the place where the user's
projects, the agents that build them, their decisions, versions, ideas and
workflow are kept together.

**Where things live - and nowhere else:**

| What | Where |
|---|---|
| The plan, box by box | File Fabric canvas **AutomatU**, totem **AutomatU Build Plan** |
| How every built part works | same canvas, totem **AutomatU: how it works** |
| The workflow and the rules for agents | same canvas, totem **Rules and Criteria for Building Agents** |
| Talking to NoteX's builder | canvas **A2A - NoteX** |
| Decisions, problems and why | this repository's GitX record (`.gitx`) |
| Code and commits | this repository |

Explanations live on the canvas and nowhere else - not in extra files in this
repository. The README is only a short front page. The canvas cites GitX ids
and never restates them. Read the canvas with `notex_read` before planning
anything.

---

## 1. The workflow - follow it every time

1. **Plan on the canvas first.** Every step of a feature is written as a box in
   the plan totem before any code: what it does, why, and a **Test by hand**
   note saying how anyone can check it.
2. **Wait for the user's go, given in the chat.** Nothing is built before it.
3. **Build strictly with the GitX workflow** (section 2). Every decision -
   yours and the user's - every problem met while coding, and why each choice
   was made, is recorded as a thought and attached to the commit it belongs
   to. The user's decisions are recorded with `decided_by: "user"`.
4. **Explain on the canvas once it is built.** In **AutomatU: how it works**,
   add or rewrite the part for every feature the plan brought: algorithms,
   architecture, fixtures and tests, reasons, the problems met with the
   commits that fixed them, and what the user asked for. Link the part to the
   plan box it explains. Tick the plan box's "Built" checklist with its
   commits.
5. **AutomatU aligns it:** the code lands under its plan box on the map by
   itself (check it does), explanations sit beside it, phases are kept in
   time.

**When a plan changes an earlier feature:** the plan names that feature and
updates its box in the same plan, before the go. The box keeps its place and
name; its words change to the new behaviour with one line saying for which
box, when and why, citing the decision. Its old words stay in the canvas
history; its explanation part is rewritten once the change is built.

**Maintaining:** the agent that built a project maintains it. Other agents get
what they need through totems the builder keeps for them (for example a
**Skills** totem for a resume agent) and may leave it questions (later).

**Code is truth.** What the code does decides where it belongs, never what the
canvas hoped. Build one plan box at a time; each commit serves one box. A
commit message says what the code does in plain words and **never names the
canvas box or its number** - AutomatU must place it by meaning.

---

## 2. Connectors

### NoteX - the canvas

| Tool | Use |
|---|---|
| `notex_canvases` | list canvases: which are agent canvases, which is the rules canvas, what is queued |
| `notex_read` | a canvas as totem scripts, every place with its address; `at="<Totem> (totem)"` for one totem |
| `notex_write` | write a script - **only when the plan step or the user calls for it**; write as `claude-automatu-builder` |

Rules for writing:

- **AutomatU is an agent canvas: send a totem's whole script** to change it;
  `<Add>`, `<Edit>` and `<Remove>` are refused there.
- **Keep each totem's `id` exactly as read** (`<Totem id="tm-..." name="...">`).
  To rename a totem, keep its id and change its name. A new totem gets no id -
  NoteX makes one. Never copy an id to another totem. The plan totem is
  `tm-a39e299aa1`.
- **Never write the rules canvas** (Ruling Test) - it holds only the user's
  words. **Never move, edit or delete the user's items** - flag problems for
  the user instead. If File Fabric has the canvas open, the script is queued
  until it lets go.
- Cite GitX ids (`t-...`, commit hashes) on the canvas; never restate what
  GitX holds.

**Canvas script syntax** (NoteX lays everything out - give no sizes or
positions):

```
<Canvas name="AutomatU">
  <Totem id="tm-..." name="AutomatU Build Plan">
    <Text>What this totem is, who wrote it.</Text>
    <Row>                                    side by side, tops aligned
      <Area name="12. The plan in time">     a box; boxes nest to any depth
        <Note name="What it shows">- one whole line per item
- [ ] an unticked checklist item
- [x] a ticked one</Note>
      </Area>
      <Area name="Another box"><Column>...</Column></Area>
    </Row>
    <SubTotem name="A big part">...boxes...</SubTotem>   one level, only for a group worth jumping to
    <Link from="Box A" to="Box B"/>                      a connection, inside this totem
    <Link from="Box A" to="AutomatU Build Plan (totem) > 1. Sources"/>   into another totem, by full address
  </Totem>
</Canvas>
```

- Other tags: `<File path="C:\full\path.png"/>` (a picture or file),
  `<Image name="..."><![CDATA[<svg ...>]]></Image>` (a drawn SVG under 60 KB),
  `<ProgressBarLink>Note name</ProgressBarLink>` (a progress bar over a note's
  checklist), `<ScrollBox>` with `<Page>`s. `<Line>` only draws; use `<Link>`
  to connect.
- Write `<` as `&lt;` and `&` as `&amp;` in text, or use `<![CDATA[...]]>`.
  Two boxes side by side need different names. Keep a note's items as whole
  lines - File Fabric wraps them.

**Canvas history** (NoteX keeps it for agent canvases with Keep history on):
`GET /api/fabrics/<canvas>/history` lists every write (time, who, totems
added, changed, renamed, deleted); `GET /api/fabrics/<canvas>/script?when=<ISO
time>` gives the scripts as they stood then. Both on NoteX's engine, with the
`x-notex-token` from NoteX's `plugin/runtime.json`.

### GitX - code, commits and the reasoning behind them

The full loop is in the `gitx-workflow` skill (`.claude/skills`,
`.agents/skills`); this is what matters most here.

**Asking GitX (`gitx_search`) - give the subject, not your prompt.**

- Put **the subject in a few words** in `query` - a feature, a concept, an
  area: `"no code threshold"`, `"path knowledge"`. Never paste the user's
  sentence or your own question. Words like "which", "file", "function" or the
  project's name count against the match: on 9 Nov the full sentence "Which
  file and function in GitX decide that a question has no matching code, and
  at what threshold?" scored 0.399 and returned no code, while "no code
  threshold" found it at 1.00.
- Say **what you want back with structure, not words**: `lens` (`what`, `how`,
  `where`, `when`, `why`), `include` (`rejected`, `open`, `constraint`, ...),
  `effort` (`brief`, `normal`, `deep`), `focus` (`thinking` for decisions,
  `code` for code), `budget` for a token cap.
- For an **exact name, value or list**, use `find` (`find: "NO_CODE"`), not a
  question. To read a function GitX named, use `expand`.
- Always pass `cwd` with the repository's path. Pass `new: true` when a
  question is not a follow-up of the last one.
- If the answer says `no_code`, read `commits_by_message` and expand the
  functions they still own, or ask again with one of its `next` calls.

**Recording and committing:**

1. At the start of a session: `gitx_thought_catch_up`.
2. Before building: search the plan against GitX's decisions (`gitx_search`,
   `focus: "thinking"`) - never re-decide what was settled.
3. As things happen: `gitx_thought_record` - decisions (with `decided_by`),
   rejected alternatives, costs, findings, rules learned. Text under 600
   characters; the reasoning goes in `forces`. Ids come back from the call -
   never type one before it returns.
4. Cite thought ids in code comments where the decision shows.
5. Stage, run `gitx_find_related`, then write the message: a
   `type(scope): what changed` subject, a body saying why (what forced it, what
   was tried, what it rules out, how it was checked - not a file list), then
   **one last block with no blank line inside it**: `GitX-Builds-On: <hash>`
   (or `GitX-Root:`), `GitX-Relates-To:`, `GitX-Thoughts: t-..., t-...`, the
   `Co-Authored-By:` line and the `Claude-Session:` line. GitX and git read
   trailers only from the last paragraph: a link above a blank line is lost,
   and the commit stands unconnected in the commit graph (t-e471da5aca).
6. GitX's Monitor is not watching this repository, so settle the thoughts by
   hand after each commit:
   `node --input-type=module -e "import { promote } from 'file:///E:/Coding%20CLI/Project%20GitX/mcp/tools/promote.js'; console.log(promote('E:/Coding CLI/Project AutomatU', '<full sha>', ['t-...']))"`
7. Add the commit's line to the self-test answer key (section 4).

---

## 3. What AutomatU has and how to run it

Needs: Docker Desktop with the database (`docker start automatu-pg`, or
`docker compose up -d`), Ollama with `bge-m3`, Node, a GitX checkout, and NoteX
running. Python 3.12 in `.venv`.

```
.venv\Scripts\automatu bind <repo> <canvas> --totem "<plan totem>" [--replace]
.venv\Scripts\automatu sources <repo>      what AutomatU reads for a repository
.venv\Scripts\automatu align <repo>        make a map
.venv\Scripts\automatu serve [--port N] [--no-watch]   map view on http://127.0.0.1:7790
.venv\Scripts\automatu calibrate [--write] the placement numbers, on the Harness canvas
```

Settings: `AUTOMATU_DB_URL`, `OLLAMA_URL`, `AUTOMATU_EMBED_MODEL`, `GITX_DIR`,
`NOTEX_RUNTIME`.

**Only the canvases the user adds are in AutomatU** (box 24, t-4fb5a8ff46): the
Canvases button on the page lists NoteX's canvases to add or remove; the list
is kept in the store (`added_canvas`, every change in `added_canvas_log`).
The Main map, `find`, `box`, `shelf` and the MCP `canvases` tool cover exactly
those, bound to a repository or not; Knowledge Desk indexes the same list.
Binding adds its canvas, and a bound canvas stays while the binding does.

The bell also rings for each box a desk tracks that changed or went since its
agent read it, read from Knowledge Desk's `/knowledge/tracking` with
AutomatU's token (t-e8412b6296).

**The Knowledge Desk tab** (box 25, `web/kd.js`, `automatu/knowledge.py`): the
tabs are Main, Code, Canvas and Knowledge Desk. Its sections are Desks (the
desks the user created, who sits at each, creating, changing and removing
them - passed on to Knowledge Desk from this page only - and the hosted desks'
cards and runs), Flows (the Workflows editor), Tracking (each desk's tracked
boxes and the index) and Monitoring (A2A and tracing, which come with K6).
Everything is read from Knowledge Desk's server (`AUTOMATU_KNOWLEDGE_DESK`,
default 127.0.0.1:7796) with AutomatU's token, through `/api/kd`. The Main
map draws the Tracking layer: tracked boxes ringed in orange.

Built features (each explained on the canvas in **AutomatU: how it works**):
binding a repository to its canvas and plan totem; reading GitX through a Node
bridge (`automatu/gitx_bridge.mjs`, never code text); reading the canvas
through NoteX; placing code under the plan (local embeddings, a clear-match
rule, Venn sharing); calibration and self-tests; the map view (Main, Code,
Canvas tabs, traffic search, pictures); the live map; related neighbours
(boxes arranged by relation, with why). The map view's API: `/api/repos`,
`/api/map`, `/api/canvases`, `/api/canvases/available`, `/api/canvases/add`,
`/api/canvases/remove` (the last two from the page only), `/api/code`,
`/api/relations`, `/api/canvas-image`.

---

## 4. Maintaining it

- **Tests:** `.venv\Scripts\python -m pytest` and `node --test web/`. Tests use
  made-up canvases, vectors and repositories in temp folders - never the
  user's real data.
- **Self-test answer key:** `E:\Coding CLI\AutomatU answer key\key.jsonl` -
  one line per commit, `{"commit": "<12 chars>", "section": "<plan box
  address>", "note": "..."}`. A commit about the whole project (like the
  README) gets no line. **AutomatU's own code must never read the key**; only
  the scorer does. The pass mark is fixed before a test and never moved after
  seeing results; never re-score the same test as if it were new.
- **Calibration:** on the Harness canvas, RAGX and NoteX only - **never
  CanvasX**. Never tune on held-out data.
- **After a feature is built:** update its plan box's "Built" checklist and its
  part in **AutomatU: how it works**; check the live map placed its code under
  the right box.
- **Windows shell:** heredocs and `sed` in Git Bash drop backslashes - edit
  files with the editor tools, not shell text.
- **Never** commit or send secrets, and never touch the user's other projects'
  data while testing.
