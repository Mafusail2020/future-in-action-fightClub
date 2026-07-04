"""API contract tests. Fully offline: the agent and DB are replaced with fakes."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from app.agent import labels
from app.dependencies import get_agent_factory
from app.main import app


class FakeAgent:
    """Simulates one agent turn: a 'tool' registers an item, the model cites it."""

    async def ainvoke(self, state, config=None):
        assert config["configurable"]["thread_id"]
        labels.label_items([{
            "id": "metric:kroshnia:shop_count", "source_type": "metric",
            "content": "shop_count = 42", "metric": "shop_count",
            "raion_slug": "kroshnia",
        }])
        return {"messages": [AIMessage(content="У Крошні 42 магазини [S1]. Вигадка [S9].")]}


def test_chat_contract():
    app.dependency_overrides[get_agent_factory] = lambda: (lambda alias="sonnet": FakeAgent())
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat", json={"message": "Скільки магазинів у Крошні?"})
        assert response.status_code == 200
        body = response.json()
        assert body["session_id"]
        assert body["answer"] == "У Крошні 42 магазини [1]. Вигадка ."
        assert body["citations"][0]["n"] == 1
        assert body["citations"][0]["title"].startswith("Показник")
        assert body["map"]["viewport"]["center"] == [28.6587, 50.2547]
        assert body["meta"]["model"] == "sonnet"
    finally:
        app.dependency_overrides.clear()


def test_chat_requires_message():
    client = TestClient(app)
    assert client.post("/api/v1/chat", json={"message": ""}).status_code == 422


def test_chat_rejects_unknown_model():
    client = TestClient(app)
    response = client.post("/api/v1/chat", json={"message": "hi", "model": "gpt"})
    assert response.status_code == 422


def test_health(monkeypatch):
    import app.api.v1.health as health_module

    fake = MagicMock()
    fake.table.return_value.select.return_value.limit.return_value.execute.return_value = None
    monkeypatch.setattr(health_module, "get_supabase", lambda: fake)

    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
