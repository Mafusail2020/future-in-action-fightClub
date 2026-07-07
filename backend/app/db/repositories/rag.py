"""Data access for RAG: solution chunks, city documents, similarity RPCs."""

from __future__ import annotations

from supabase import Client


def city_key(city: str, country: str) -> str:
    return f"{city.strip().lower()}|{country.strip().lower()}"


class RagRepository:
    def __init__(self, client: Client):
        self.client = client

    # --- solutions ---------------------------------------------------------------

    def replace_solution_chunks(self, solution_id: str, rows: list[dict]) -> None:
        self.client.table("solution_chunks").delete().eq("solution_id", solution_id).execute()
        if rows:
            self.client.table("solution_chunks").insert(rows).execute()

    def search_solutions(self, query_embedding: list[float], k: int = 6) -> list[dict]:
        return (
            self.client.rpc(
                "match_solution_chunks",
                {"query_embedding": query_embedding, "match_count": k},
            )
            .execute()
            .data
        )

    # --- city docs ---------------------------------------------------------------

    def insert_city_doc(self, doc: dict) -> dict:
        return self.client.table("city_docs").insert(doc).execute().data[0]

    def delete_profile_doc(self, key: str) -> None:
        (
            self.client.table("city_docs")
            .delete()
            .eq("city_key", key)
            .eq("kind", "profile")
            .execute()
        )

    def delete_city_docs_by_kind(self, key: str, kinds: list[str]) -> None:
        """Drop prior docs of the given kinds for a city (chunks cascade), so a
        dossier rebuild replaces rather than piles up."""
        (
            self.client.table("city_docs")
            .delete()
            .eq("city_key", key)
            .in_("kind", kinds)
            .execute()
        )

    def list_city_docs(self, key: str) -> list[dict]:
        return (
            self.client.table("city_docs")
            .select("id, title, kind, source_url, created_at")
            .eq("city_key", key)
            .order("created_at", desc=True)
            .execute()
            .data
        )

    def insert_city_doc_chunks(self, rows: list[dict]) -> None:
        if rows:
            self.client.table("city_doc_chunks").insert(rows).execute()

    def search_city_docs(
        self, query_embedding: list[float], key: str, k: int = 6
    ) -> list[dict]:
        return (
            self.client.rpc(
                "match_city_doc_chunks",
                {"query_embedding": query_embedding, "p_city_key": key, "match_count": k},
            )
            .execute()
            .data
        )
