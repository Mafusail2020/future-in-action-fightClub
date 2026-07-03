from typing import Any

from app.db.client import get_supabase


def upsert_source(kind: str, name: str, url: str | None = None,
                  meta: dict[str, Any] | None = None) -> str:
    """Idempotent on (kind, name); returns the source id."""
    res = (
        get_supabase()
        .table("sources")
        .upsert({"kind": kind, "name": name, "url": url, "meta": meta or {}},
                on_conflict="kind, name")
        .execute()
    )
    return res.data[0]["id"]


def insert_document(row: dict[str, Any]) -> str:
    res = get_supabase().table("documents").insert(row).execute()
    return res.data[0]["id"]


def delete_by_external_id(source_id: str, external_id: str) -> None:
    """Remove a scraper-owned document before re-inserting its fresh version."""
    (
        get_supabase()
        .table("documents")
        .delete()
        .eq("source_id", source_id)
        .eq("external_id", external_id)
        .execute()
    )


def insert_chunks(rows: list[dict[str, Any]]) -> None:
    if rows:
        get_supabase().table("doc_chunks").insert(rows).execute()


def get_documents_by_ids(ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    res = (
        get_supabase()
        .table("documents")
        .select("id, title, doc_type, category, url, published_at, raion_id, source_id")
        .in_("id", ids)
        .execute()
    )
    return res.data or []


def list_documents_for_raion(raion_id: str, limit: int = 50) -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("documents")
        .select("id, title, doc_type, category, url, published_at, content")
        .eq("raion_id", raion_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []
