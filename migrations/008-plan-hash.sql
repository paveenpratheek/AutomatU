-- A fingerprint of the plan's words a map was made from, so the live map can
-- tell that a box was added or reworded and make a new map. t-5b98c27370
ALTER TABLE map_run ADD COLUMN plan_hash text;
