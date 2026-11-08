"""A map is a snapshot: what was placed stays as it was made."""


def test_calibrated_numbers_carry_both_thresholds():
    from automatu.maps import calibrated
    try:
        n = calibrated()
    except RuntimeError as e:
        assert "calibration" in str(e)
    else:
        assert isinstance(n.min_score, float) and isinstance(n.min_margin, float)


def test_a_run_and_its_placements_are_kept_and_go_together(store):
    conn = store.db()
    run = conn.execute("INSERT INTO map_run (repo, canvas, head, model, min_score, min_margin, regions, placed) "
                       "VALUES ('R','C','abc','m',0.5,0.02,2,1) RETURNING id").fetchone()[0]
    conn.execute("INSERT INTO placement (run_id, region, section, sections, near, best, score, margin) VALUES "
                 "(%s,'a.py::f','S1','{S1}','{S1}','S1',0.7,0.1), (%s,'b.py::g',NULL,'{}','{S2}','S2',0.4,0.01)", (run, run))
    rows = conn.execute("SELECT region, sections, near FROM placement WHERE run_id = %s ORDER BY region", (run,)).fetchall()
    assert rows == [("a.py::f", ["S1"], ["S1"]), ("b.py::g", [], ["S2"])]
    conn.execute("DELETE FROM map_run WHERE id = %s", (run,))
    assert conn.execute("SELECT count(*) FROM placement WHERE run_id = %s", (run,)).fetchone()[0] == 0
