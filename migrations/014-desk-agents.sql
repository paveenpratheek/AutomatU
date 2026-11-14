-- Agents placed in AutomatU, one at each desk (box 30, t-e02af0ac56): the agent
-- the user chose for a desk, and the desk's chat - the messages given to the
-- agent by the user or another agent, its replies, the permissions it asked
-- for and how they were answered. Kept whole, as CanvasX's agent chat is;
-- a new session is given the last 15.
CREATE TABLE IF NOT EXISTS desk_agent (
  desk         text PRIMARY KEY,         -- the desk's slug in Knowledge Desk
  name         text NOT NULL,
  canvas       text NOT NULL,            -- its Main canvas, whose hex holds the Agents button
  agent        text NOT NULL,            -- agy, claude
  model        text NOT NULL,
  folder       text NOT NULL,            -- where it does the work
  chosen_at    timestamptz NOT NULL DEFAULT now(),
  detached_at  timestamptz
);

CREATE TABLE IF NOT EXISTS desk_message (
  id     bigserial PRIMARY KEY,
  desk   text NOT NULL,
  at     timestamptz NOT NULL DEFAULT now(),
  who    text NOT NULL,                  -- user, agent, or the A2A caller that sent it
  kind   text NOT NULL,                  -- message, reply, ask, note
  text   text NOT NULL DEFAULT '',
  state  text NOT NULL DEFAULT '',
  data   jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS desk_message_desk ON desk_message (desk, id);
