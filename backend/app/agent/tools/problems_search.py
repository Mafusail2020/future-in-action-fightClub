import json

from langchain_core.tools import tool

from app.db.repositories.raions import slug_id_map
from app.rag import retriever


@tool
def problems_search(query: str, raion_slug: str | None = None,
                    category: str | None = None) -> str:
    """Semantic search over collected Zhytomyr city data (documents, reports, news, profiles).

    Args:
        query: what to look for, in Ukrainian or English.
        raion_slug: limit to one city area (slug), or omit for city-wide search.
        category: one of roads|transport|commerce|demographics|utilities|safety, or omit.
    Returns JSON with text fragments; each has an "id" usable for citations.
    """
    raion_id = slug_id_map().get(raion_slug) if raion_slug else None
    items = [
        {
            "id": row["id"],
            "source_type": "document",
            "content": row["content"],
            "document_id": row["document_id"],
            "raion_id": row["raion_id"],
            "category": row.get("category"),
            "similarity": round(row.get("similarity", 0), 3),
        }
        for row in retriever.search_problems(query, raion_id=raion_id, category=category)
    ]
    # City-wide questions also benefit from the coarse per-raion digests.
    if raion_id is None:
        items += [
            {
                "id": row["id"],
                "source_type": "digest",
                "content": row["content"],
                "raion_id": row["raion_id"],
                "similarity": round(row.get("similarity", 0), 3),
            }
            for row in retriever.search_digests(query, k=2)
        ]
    return json.dumps({"items": items}, ensure_ascii=False, default=str)
