-- Embeddings AutomatU made, one per commit message, thought or canvas section.
-- Only the vector and a hash of the text it came from: the text itself stays
-- in GitX or on the canvas, and a changed text is re-embedded.
CREATE TABLE embedding (
  key        text NOT NULL,
  model      text NOT NULL,
  text_hash  text NOT NULL,
  vec        vector(1024) NOT NULL,
  made_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, model)
);
