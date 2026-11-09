-- The time domain (t-25f10ce5fd).
--
-- The binding names its plan totem by the totem's lasting id too, so a renamed
-- totem stays the plan; and every change to a binding is kept in a log instead
-- of only overwriting the one row, so which totem was the plan at any moment
-- is a lookup. Entries rebuilt afterwards from the maps say so.
ALTER TABLE binding ADD COLUMN IF NOT EXISTS totem_id text;
CREATE TABLE IF NOT EXISTS binding_log (
  id        bigserial PRIMARY KEY,
  repo      text NOT NULL,
  canvas    text NOT NULL,
  totem     text,
  totem_id  text,
  at        timestamptz NOT NULL DEFAULT now(),
  rebuilt   boolean NOT NULL DEFAULT false,
  note      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS binding_log_repo_at ON binding_log (repo, at);

-- Vectors kept by the text they came from, not by the box or commit they
-- belong to, so an old and a new version of a box's words never push each
-- other out, and the same text is embedded once, ever.
CREATE TABLE IF NOT EXISTS vector_cache (
  model      text NOT NULL,
  text_hash  text NOT NULL,
  vec        vector(1024) NOT NULL,
  made_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, text_hash)
);
INSERT INTO vector_cache (model, text_hash, vec)
  SELECT DISTINCT ON (model, text_hash) model, text_hash, vec FROM embedding
  ON CONFLICT DO NOTHING;
