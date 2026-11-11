-- What the user arranges for the Work Desks desks (box 20): each job's flow,
-- and each desk's grants, kept in time - every save a new version, none
-- written over - so a run can name the arrangement it ran (t-d966145acd,
-- t-7d4389282b). Never on a canvas (t-0ad73f14d1). A desk is named by its
-- slug, as it names itself.
CREATE TABLE IF NOT EXISTS arrangement (
  id        bigserial PRIMARY KEY,
  desk      text NOT NULL,
  job       text NOT NULL,
  version   integer NOT NULL,
  -- [{step, tries, back_to, stop_before}], as the desk checked it
  steps     jsonb NOT NULL,
  note      text NOT NULL DEFAULT '',
  saved_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (desk, job, version)
);

CREATE TABLE IF NOT EXISTS desk_grant (
  id        bigserial PRIMARY KEY,
  desk      text NOT NULL,
  version   integer NOT NULL,
  writes    jsonb NOT NULL,      -- canvases its agent may write
  asks      jsonb NOT NULL,      -- desks it may ask
  saved_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (desk, version)
);
