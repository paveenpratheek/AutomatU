-- The totem that is the plan: code is placed only under its boxes, and the
-- rest of the canvas is extra information. NULL places under every box, as
-- on a canvas whose totems each explain a repository. t-ea1ec85327
ALTER TABLE binding ADD COLUMN totem text;
