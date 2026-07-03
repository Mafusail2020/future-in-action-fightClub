"""Single source of truth for embeddings.

Both the query side (agent tools) and the write side (ingestion, digests,
solutions layer) must import from here — a model or dimension mismatch
between pools breaks retrieval silently.
"""

from functools import lru_cache

from openai import OpenAI

from app.config import get_settings

_BATCH_SIZE = 100
_MAX_CHARS = 8000  # guard against the 8191-token input limit


@lru_cache
def _client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts, batched, preserving order."""
    settings = get_settings()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), _BATCH_SIZE):
        batch = [t.replace("\n", " ")[:_MAX_CHARS] or " " for t in texts[i : i + _BATCH_SIZE]]
        response = _client().embeddings.create(model=settings.embedding_model, input=batch)
        vectors.extend(item.embedding for item in response.data)
    return vectors


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
