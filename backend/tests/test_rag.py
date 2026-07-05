"""Agentic RAG: chunking, label registry, tool dispatch, sources SSE. Offline."""

import json

from fastapi.testclient import TestClient

from app.agent import search_tools as st
from app.agent.pipeline import Agent
from app.agent.search_tools import SearchToolkit
from app.dependencies import get_agent
from app.main import app
from app.rag.chunking import CHUNK_SIZE, chunk_text

# --- chunking --------------------------------------------------------------------


def test_chunk_text_sizes_and_paragraphs():
    assert chunk_text("") == []
    assert chunk_text("короткий текст") == ["короткий текст"]

    text = "\n\n".join(f"Абзац {i}. " + "слово " * 60 for i in range(6))
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(c) <= CHUNK_SIZE for c in chunks)
    assert all(c.strip() for c in chunks)


# --- toolkit ---------------------------------------------------------------------


class FakeRag:
    def search_solutions(self, embedding, k=6):
        return [{
            "chunk_id": "ch-1", "solution_id": "sol-1",
            "content": "Cycle superhighways cut congestion.",
            "similarity": 0.91, "title": "Cycle Superhighways",
            "city_name": "Copenhagen", "country": "Denmark",
            "source_urls": ["https://example.com"],
        }]

    def search_city_docs(self, embedding, key, k=6):
        return [{
            "chunk_id": "cd-1", "doc_id": "doc-1",
            "content": "Затори на мостах у години пік.",
            "similarity": 0.8, "title": "Профіль міста Zhytomyr (AI)",
            "kind": "profile", "source_url": None,
        }]


def test_toolkit_labels_and_sources(monkeypatch):
    monkeypatch.setattr(st, "embed_query", lambda q: [0.0] * 3)
    toolkit = SearchToolkit(FakeRag(), city_key="zhytomyr|ukraine")

    out = json.loads(toolkit.run("search_solutions", {"query": "traffic"}))
    assert out["items"][0]["label"] == "S1"

    out2 = json.loads(toolkit.run("search_city_state", {"query": "затори"}))
    assert out2["items"][0]["label"] == "S2"

    assert toolkit.run("direct_map", {}) is None  # not a search tool
    assert set(toolkit.sources) == {"S1", "S2"}
    assert toolkit.sources["S1"]["type"] == "solution"
    assert toolkit.sources["S2"]["type"] == "city_doc"


def test_toolkit_without_city():
    toolkit = SearchToolkit(FakeRag(), city_key=None)
    out = json.loads(toolkit.run("search_city_state", {"query": "x"}))
    assert "error" in out


# --- route: sources reach the wire as an SSE event ---------------------------------


class FakeCitiesRepo:
    def list_with_counts(self):
        return []


class FakeAgentWithSources:
    cities = FakeCitiesRepo()

    def answer_stream(self, message, profile, matches, history,
                      on_map_op=None, sources_out=None):
        yield "Відповідь з джерелом [S1]."
        if sources_out is not None:
            sources_out["S1"] = {"type": "solution", "title": "Cycle Superhighways",
                                 "city": "Copenhagen, Denmark", "url": "https://example.com"}


def test_route_emits_sources_event():
    app.dependency_overrides[get_agent] = lambda: FakeAgentWithSources()
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat", json={"message": "q"})
        assert "event: sources" in response.text
        assert "Cycle Superhighways" in response.text
        events = [
            line.split(" ", 1)[1]
            for line in response.text.split("\n")
            if line.startswith("event: ")
        ]
        assert events[-1] == "done"
        assert events[-2] == "sources"
    finally:
        app.dependency_overrides.clear()


# --- pipeline: search tools registered only when embeddings available --------------


class FakeLLMCapture:
    def __init__(self):
        self.tools_seen = None

    def stream_with_tools(self, system, messages, tools, on_tool, **kwargs):
        self.tools_seen = [t["name"] for t in tools]
        yield "ok"


def test_search_tools_join_only_with_embeddings(monkeypatch):
    from app.agent import pipeline as pl

    llm = FakeLLMCapture()
    agent = Agent(llm=llm, cities=FakeCitiesRepo(), solutions=None, rag=FakeRag())

    monkeypatch.setattr(pl, "embeddings_available", lambda: False)
    list(agent.answer_stream("q", None, [], [], on_map_op=lambda _: None))
    assert llm.tools_seen == ["direct_map"]

    monkeypatch.setattr(pl, "embeddings_available", lambda: True)
    list(agent.answer_stream("q", None, [], [], on_map_op=lambda _: None))
    assert llm.tools_seen == ["direct_map", "search_solutions", "search_city_state"]
