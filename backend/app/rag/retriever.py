"""Vector retrieval over the two RAG pools. Pure functions: embed query -> RPC -> rows."""

from typing import Any

from app.db.client import get_supabase
from app.rag.embeddings import embed_query

# Population band for "cities similar to Zhytomyr" (~260k).
ZHYTOMYR_POP_BAND = (100_000, 600_000)


def search_problems(query: str, raion_id: str | None = None, category: str | None = None,
                    k: int = 8) -> list[dict[str, Any]]:
    res = get_supabase().rpc(
        "match_doc_chunks",
        {
            "query_embedding": embed_query(query),
            "match_count": k,
            "filter_raion": raion_id,
            "filter_category": category,
        },
    ).execute()
    return res.data or []


def search_solutions(query: str, domain: str | None = None,
                     pop_band: tuple[int, int] | None = ZHYTOMYR_POP_BAND,
                     k: int = 8) -> list[dict[str, Any]]:
    pop_min, pop_max = pop_band if pop_band else (None, None)
    res = get_supabase().rpc(
        "match_solution_chunks",
        {
            "query_embedding": embed_query(query),
            "match_count": k,
            "filter_domain": domain,
            "pop_min": pop_min,
            "pop_max": pop_max,
        },
    ).execute()
    return res.data or []


def search_digests(query: str, k: int = 3) -> list[dict[str, Any]]:
    res = get_supabase().rpc(
        "match_raion_digests",
        {"query_embedding": embed_query(query), "match_count": k},
    ).execute()
    return res.data or []
