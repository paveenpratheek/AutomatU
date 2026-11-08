-- Every map AutomatU makes is kept as a snapshot: the run (which repository,
-- canvas, HEAD, model and numbers) and where each region was placed. A map
-- made earlier stays the same when the sources change later. t-42b6c9355c
CREATE TABLE map_run (
  id          bigserial PRIMARY KEY,
  repo        text NOT NULL,
  canvas      text NOT NULL,
  head        text NOT NULL,
  model       text NOT NULL,
  min_score   real NOT NULL,
  min_margin  real NOT NULL,
  regions     integer NOT NULL,
  placed      integer NOT NULL,
  made_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX map_run_repo ON map_run (repo, made_at DESC);

-- section is NULL while a region is not yet placed; best is its nearest
-- section either way.
CREATE TABLE placement (
  run_id   bigint NOT NULL REFERENCES map_run (id) ON DELETE CASCADE,
  region   text NOT NULL,
  section  text,
  best     text NOT NULL,
  score    real NOT NULL,
  margin   real NOT NULL,
  PRIMARY KEY (run_id, region)
);
