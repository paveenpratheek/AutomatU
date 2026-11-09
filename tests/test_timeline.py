from automatu.timeline import follow, utc


def test_boxes_are_followed_by_their_lines_not_their_names():
    before = {"P (totem) > 3. Map view": "3. Map view\nThe map: a hexagon per region\nServed by FastAPI\nRead live from NoteX",
              "P (totem) > 4. Live map": "4. Live map\nWatches HEAD",
              "P (totem) > Old idea": "Old idea\nSomething dropped"}
    after = {"P (totem) > 3. The map": "3. The map\nThe map: a hexagon per region\nServed by FastAPI\nRead live from NoteX",
             "P (totem) > 4. Live map": "4. Live map\nWatches HEAD and the plan",
             "P (totem) > 5. New box": "5. New box\nNothing like the others"}
    ch = follow(before, after)
    assert ch["renamed"] == [["P (totem) > 3. Map view", "P (totem) > 3. The map"]], "same lines, new name: the same box"
    assert ch["reworded"] == ["P (totem) > 4. Live map"]
    assert ch["added"] == ["P (totem) > 5. New box"] and ch["removed"] == ["P (totem) > Old idea"]


def test_every_clock_is_compared_in_utc():
    assert utc("2026-11-08T17:33:34+05:30") == "2026-11-08T12:03:34.000Z"
    assert utc("2026-11-08T11:59:56.147Z") == "2026-11-08T11:59:56.147Z"
