-- A map snapshot keeps the canvas's sections as they were when it was made,
-- so the map view can list the sections that have no code yet without
-- reading the canvas again - and still shows the same map after the canvas
-- has changed. t-aeb1eeed10
ALTER TABLE map_run ADD COLUMN sections text[] NOT NULL DEFAULT '{}';
