"""AutomatU installed without Work Desks (as on CI, since Work Desks is not on
PyPI): the Agents window says what to install, and nothing is placed."""
from __future__ import annotations

import importlib.util

import pytest
from fastapi.testclient import TestClient


def test_without_work_desks_the_agents_window_says_what_to_install(store, monkeypatch):
    from automatu import desk_agents, knowledge

    async def overview(*a, **k):
        return {"desks": [{"slug": "alone-t", "name": "Alone T", "main_canvas": "Alone T", "attached": [], "owner": "alone-t"}]}
    monkeypatch.setattr(knowledge, "overview", overview)
    real = importlib.util.find_spec
    monkeypatch.setattr(importlib.util, "find_spec", lambda name, *a: None if name == "workdesks" else real(name, *a))
    from automatu.serve import app
    c = TestClient(app)
    v = c.get("/api/desk-agents", params={"canvas": "Alone T"}).json()
    assert v["agent"] is None and "need Work Desks installed beside AutomatU" in v["note"]
    with pytest.raises(ValueError, match="need Work Desks installed"):
        desk_agents.MANAGER.choose({"slug": "alone-t", "name": "Alone T", "main_canvas": "Alone T"}, "agy",
                                   "gemini-3.8-flash-low", ".")
    desk_agents.MANAGER.restore([])          # nothing to place, and nothing touched
    assert "alone-t" not in desk_agents.MANAGER.agents
