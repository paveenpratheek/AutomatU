-- A region that does several topics sits in every section it matches about
-- equally well, like a Venn overlap: sections lists them all (section is the
-- first of them), and is empty while the region is not yet placed. near is
-- the group it would join, placed or not. t-aa80ed9977, t-21f43bf927
ALTER TABLE placement ADD COLUMN sections text[] NOT NULL DEFAULT '{}';
ALTER TABLE placement ADD COLUMN near text[] NOT NULL DEFAULT '{}';
UPDATE placement SET sections = ARRAY[section] WHERE section IS NOT NULL;
UPDATE placement SET near = ARRAY[best];
ALTER TABLE map_run ADD COLUMN overlap real NOT NULL DEFAULT 0;
