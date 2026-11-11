-- The canvases the user added to AutomatU from CanvasX, through NoteX (box 24,
-- t-4fb5a8ff46): only these are on the Main map, in search, and served to
-- agents. Every add and removal is kept in a log, never written over, so which
-- canvases AutomatU held at a moment is a lookup. The canvases repositories are
-- already bound to are added here, since the user chose them when binding
-- (t-864bb59350).
CREATE TABLE IF NOT EXISTS added_canvas (
  canvas    text PRIMARY KEY,
  added_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS added_canvas_log (
  id      bigserial PRIMARY KEY,
  canvas  text NOT NULL,
  added   boolean NOT NULL,          -- true: added; false: removed
  at      timestamptz NOT NULL DEFAULT now(),
  note    text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS added_canvas_log_at ON added_canvas_log (at);

INSERT INTO added_canvas_log (canvas, added, note)
  SELECT DISTINCT canvas, true, 'a repository was already bound to it' FROM binding
  WHERE canvas NOT IN (SELECT canvas FROM added_canvas);
INSERT INTO added_canvas (canvas)
  SELECT DISTINCT canvas FROM binding ON CONFLICT DO NOTHING;
