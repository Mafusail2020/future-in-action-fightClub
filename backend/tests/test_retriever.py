"""Retriever RPC parameter construction and chunking sanity. Supabase + embeddings mocked."""

from app.rag import retriever
from app.rag.chunking import chunk_text


class FakeSupabase:
    def __init__(self):
        self.calls = []

    def rpc(self, fn, params):
        self.calls.append((fn, params))

        class _Result:
            data = []

            def execute(self):
                return self

        return _Result()


def _patch(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(retriever, "get_supabase", lambda: fake)
    monkeypatch.setattr(retriever, "embed_query", lambda q: [0.0] * 1536)
    return fake


def test_search_problems_params(monkeypatch):
    fake = _patch(monkeypatch)
    retriever.search_problems("ями на дорогах", raion_id="r-1", category="roads", k=5)
    fn, params = fake.calls[0]
    assert fn == "match_doc_chunks"
    assert params["match_count"] == 5
    assert params["filter_raion"] == "r-1"
    assert params["filter_category"] == "roads"
    assert len(params["query_embedding"]) == 1536


def test_search_solutions_default_population_band(monkeypatch):
    fake = _patch(monkeypatch)
    retriever.search_solutions("traffic", domain="transport")
    fn, params = fake.calls[0]
    assert fn == "match_solution_chunks"
    assert (params["pop_min"], params["pop_max"]) == retriever.ZHYTOMYR_POP_BAND

    retriever.search_solutions("traffic", pop_band=None)
    _, params = fake.calls[1]
    assert params["pop_min"] is None and params["pop_max"] is None


def test_chunking_sizes():
    text = "Речення про стан доріг у Житомирі. " * 200
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(c) <= 800 for c in chunks)

    assert chunk_text("Короткий текст.") == ["Короткий текст."]
    assert chunk_text("   ") == []
