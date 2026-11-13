-- Vectors of any size (t-ca3943cad2): bge-m3 gives 1,024 numbers, EmbeddingGemma 768.
-- Each vector is kept beside the model that made it, and only vectors of one
-- model are ever compared, so the column no longer fixes a size.
ALTER TABLE vector_cache ALTER COLUMN vec TYPE vector;
ALTER TABLE embedding ALTER COLUMN vec TYPE vector;
