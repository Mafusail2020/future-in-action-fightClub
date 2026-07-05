"""Single source of truth for embeddings (write side AND query side).

text-embedding-3-small @ 1536 — a model/dimension mismatch between ingest and
query breaks retrieval silently, so nothing else may embed text.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from app.config import get_settings

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
_BATCH = 100
_MAX_CHARS = 8000  # stay under the 8191-token input limit


@lru_cache
def _client() -> OpenAI:
    key = get_settings().openai_api_key
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured (needed for RAG embeddings)")
    return OpenAI(api_key=key)


def embeddings_available() -> bool:
    return bool(get_settings().openai_api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batched, order-preserving."""
    vectors: list[list[float]] = []
    for i in range(0, len(texts), _BATCH):
        batch = [t.replace("\n", " ")[:_MAX_CHARS] or " " for t in texts[i : i + _BATCH]]
        response = _client().embeddings.create(model=EMBEDDING_MODEL, input=batch)
        vectors.extend(item.embedding for item in response.data)
    return vectors


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
