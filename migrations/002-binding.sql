-- Which canvas plans a repository. One canvas per repository; one canvas may
-- plan several repositories (the Harness canvas explains three). t-2125e729d7
CREATE TABLE binding (
  repo      text PRIMARY KEY,
  canvas    text NOT NULL,
  bound_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX binding_canvas ON binding (canvas);
