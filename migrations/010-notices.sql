-- Notices and agents (box 13).
--
-- A notice is one plan box the code has moved past (t-5f4103c65a): one open
-- row per box, holding every commit it is behind and the regions those
-- commits changed, with file, function and lines (t-3f31f11ef2). Commits on a
-- box reworded for new work are held on the same row as in progress
-- (t-b620bd3f41). A row is closed by an agent saying what it did, or by itself
-- when every commit on it was ticked on the box (t-e64da7fa33); nothing closes
-- by time.
CREATE TABLE IF NOT EXISTS notice (
  id          bigserial PRIMARY KEY,
  repo        text NOT NULL,
  box         text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- [{sha, at, subject, state: behind | progress | ticked, ticked_by, regions: [{id, file, name, start, end}]}]
  commits     jsonb NOT NULL DEFAULT '[]',
  closed_at   timestamptz,
  closed_by   text,
  closed_how  text CHECK (closed_how IN ('done', 'still-right', 'ignored', 'ticked')),
  closed_note text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS notice_one_open ON notice (repo, box) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS notice_repo ON notice (repo, status);

-- Which agents answer for which repository (t-268908a2b1): every register and
-- step-down is a new row, never overwritten; what stands is each agent's last
-- row for a repository.
CREATE TABLE IF NOT EXISTS agent_log (
  id      bigserial PRIMARY KEY,
  agent   text NOT NULL,
  repo    text NOT NULL,
  action  text NOT NULL CHECK (action IN ('register', 'leave')),
  at      timestamptz NOT NULL DEFAULT now(),
  note    text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS agent_log_agent_repo ON agent_log (agent, repo, at);
