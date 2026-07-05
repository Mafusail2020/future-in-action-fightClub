"""Agentic RAG tools: semantic search over the solutions catalog and city docs.

Every retrieved fragment gets a stable [S#] label; the model may only cite those
labels, and the route ships the label->source map to the client for rendering.
"""

from __future__ import annotations

import json

from app.db.repositories.rag import RagRepository
from app.rag.embeddings import embed_query

_SNIPPET = 500

SEARCH_SOLUTIONS_TOOL: dict = {
    "name": "search_solutions",
    "description": (
        "Semantic search over the catalog of real city solutions (problem, what was done, "
        "outcome). Use when you need concrete precedents beyond the matched shortlist, or "
        "when the user asks about a topic the shortlist does not cover. Query in any "
        "language; describe the PROBLEM, not a city name."
    ),
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "maxLength": 300}},
        "required": ["query"],
    },
}

SEARCH_CITY_TOOL: dict = {
    "name": "search_city_state",
    "description": (
        "Semantic search over documents about the USER'S OWN city (its AI profile and any "
        "reports/data the user added). Use when you need facts about the user's city state "
        "before advising."
    ),
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "maxLength": 300}},
        "required": ["query"],
    },
}


class SearchToolkit:
    """Executes search tools for one request and accumulates [S#] sources."""

    def __init__(self, rag: RagRepository, city_key: str | None):
        self.rag = rag
        self.city_key = city_key
        self.sources: dict[str, dict] = {}

    def _label(self, meta: dict) -> str:
        label = f"S{len(self.sources) + 1}"
        self.sources[label] = meta
        return label

    def run(self, name: str, args: dict) -> str | None:
        """Returns the tool_result payload, or None if `name` is not a search tool."""
        if name == "search_solutions":
            return self._search_solutions(str(args.get("query", ""))[:300])
        if name == "search_city_state":
            return self._search_city_state(str(args.get("query", ""))[:300])
        return None

    def _search_solutions(self, query: str) -> str:
        if not query.strip():
            return json.dumps({"error": "empty query"})
        rows = self.rag.search_solutions(embed_query(query))
        items = []
        for row in rows:
            label = self._label({
                "type": "solution",
                "solution_id": row["solution_id"],
                "title": row["title"],
                "city": f"{row['city_name']}, {row['country']}",
                "url": (row.get("source_urls") or [None])[0],
            })
            items.append({
                "label": label,
                "solution_id": row["solution_id"],
                "title": row["title"],
                "city": row["city_name"],
                "content": row["content"][:_SNIPPET],
                "similarity": round(row.get("similarity", 0), 3),
            })
        return json.dumps({"items": items}, ensure_ascii=False)

    def _search_city_state(self, query: str) -> str:
        if self.city_key is None:
            return json.dumps({"error": "the user has not set their city"})
        if not query.strip():
            return json.dumps({"error": "empty query"})
        rows = self.rag.search_city_docs(embed_query(query), self.city_key)
        if not rows:
            return json.dumps(
                {"items": [], "note": "no documents about the user's city yet"},
                ensure_ascii=False,
            )
        items = []
        for row in rows:
            label = self._label({
                "type": "city_doc",
                "doc_id": row["doc_id"],
                "title": row["title"],
                "kind": row["kind"],
                "url": row.get("source_url"),
            })
            items.append({
                "label": label,
                "title": row["title"],
                "content": row["content"][:_SNIPPET],
                "similarity": round(row.get("similarity", 0), 3),
            })
        return json.dumps({"items": items}, ensure_ascii=False)
