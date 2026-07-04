"""SSE streaming contract: frame order token/status -> final; error path. Offline."""

from types import SimpleNamespace

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, AIMessageChunk

from app.agent import labels
from app.dependencies import get_agent_factory
from app.main import app


def _parse_sse(body: str) -> list[tuple[str, str]]:
    frames = []
    for block in body.strip().split("\n\n"):
        event, data = None, ""
        for line in block.split("\n"):
            if line.startswith("event: "):
                event = line[len("event: "):]
            elif line.startswith("data: "):
                data = line[len("data: "):]
        frames.append((event, data))
    return frames


class FakeStreamingAgent:
    async def astream(self, state, config=None, stream_mode=None):
        assert stream_mode == ["updates", "messages"]
        # model turn 1: announces a tool call
        yield ("updates", {"model": {"messages": [AIMessage(
            content="",
            tool_calls=[{"name": "problems_search", "args": {}, "id": "1",
                         "type": "tool_call"}],
        )]}})
        # the "tool" registers its item
        labels.label_items([{
            "id": "chunk-1", "source_type": "metric", "content": "shop_count = 42",
            "metric": "shop_count", "raion_slug": "kroshnia",
        }])
        # model turn 2: streams the answer
        yield ("messages", (AIMessageChunk(content="У Крошні "), {}))
        yield ("messages", (AIMessageChunk(content="42 магазини [S1]."), {}))
        self._final = AIMessage(content="У Крошні 42 магазини [S1].")

    async def aget_state(self, config):
        return SimpleNamespace(values={"messages": [self._final]})


class ExplodingAgent:
    async def astream(self, state, config=None, stream_mode=None):
        raise RuntimeError("model unavailable")
        yield  # pragma: no cover — makes this an async generator


def test_stream_frames_in_order():
    app.dependency_overrides[get_agent_factory] = \
        lambda: (lambda alias="sonnet": FakeStreamingAgent())
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat/stream", json={"message": "Магазини у Крошні?"})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        frames = _parse_sse(response.text)
        events = [e for e, _ in frames]
        assert events == ["status", "token", "token", "final"]
        assert '"problems_search"' in frames[0][1]
        assert "42 магазини" in frames[2][1]
        # final payload carries validated, renumbered citations
        assert '"[S' not in frames[3][1]
        assert '"citations"' in frames[3][1] and '"n": 1' in frames[3][1]
    finally:
        app.dependency_overrides.clear()


def test_stream_error_becomes_event():
    app.dependency_overrides[get_agent_factory] = \
        lambda: (lambda alias="sonnet": ExplodingAgent())
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat/stream", json={"message": "hi"})
        frames = _parse_sse(response.text)
        assert [e for e, _ in frames] == ["error"]
        assert "model unavailable" in frames[0][1]
    finally:
        app.dependency_overrides.clear()
