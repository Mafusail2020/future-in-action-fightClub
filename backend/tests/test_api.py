"""API contract tests. Fully offline: graph and DB are replaced with fakes."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.dependencies import get_graph
from app.main import app

CANNED_STATE = {
    "intent": "problems_qa",
    "answer": "У Крошні 42 магазини [1].",
    "citations": [{
        "n": 1,
        "chunk_id": "abc",
        "source_type": "document",
        "title": "OSM-профіль району Крошня",
        "url": None,
        "snippet": "42 магазини...",
        "raion": "Крошня",
        "city": None,
        "published_at": None,
    }],
    "map_actions": [{
        "type": "highlight_raion",
        "label": "Крошня",
        "geojson": {"type": "FeatureCollection", "features": []},
        "citation_ns": [1],
    }],
    "viewport": {"center": [28.669, 50.29], "zoom": 14},
}


class FakeGraph:
    async def ainvoke(self, state, config=None):
        assert config["configurable"]["thread_id"]
        return {**state, **CANNED_STATE}


def test_chat_contract():
    app.dependency_overrides[get_graph] = lambda: FakeGraph()
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat", json={"message": "Скільки магазинів у Крошні?"})
        assert response.status_code == 200
        body = response.json()
        assert body["session_id"]
        assert body["answer"].endswith("[1].")
        assert body["citations"][0]["n"] == 1
        assert body["map"]["actions"][0]["type"] == "highlight_raion"
        assert body["map"]["viewport"]["center"] == [28.669, 50.29]
        assert "latency_ms" in body["meta"]
    finally:
        app.dependency_overrides.clear()


def test_chat_requires_message():
    client = TestClient(app)
    assert client.post("/api/v1/chat", json={"message": ""}).status_code == 422


def test_health(monkeypatch):
    import app.api.v1.health as health_module

    fake = MagicMock()
    fake.table.return_value.select.return_value.limit.return_value.execute.return_value = None
    monkeypatch.setattr(health_module, "get_supabase", lambda: fake)

    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
