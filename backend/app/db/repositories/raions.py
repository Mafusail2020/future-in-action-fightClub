from typing import Any

from app.db.client import get_supabase


def list_raions() -> list[dict[str, Any]]:
    res = get_supabase().table("raions").select("*").order("name_uk").execute()
    return res.data or []


def get_by_slug(slug: str) -> dict[str, Any] | None:
    res = get_supabase().table("raions").select("*").eq("slug", slug).limit(1).execute()
    return res.data[0] if res.data else None


def get_by_ids(ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    res = get_supabase().table("raions").select("*").in_("id", ids).execute()
    return res.data or []


def get_boundaries(slugs: list[str]) -> list[dict[str, Any]]:
    if not slugs:
        return []
    res = (
        get_supabase()
        .table("raions")
        .select("id, slug, name_uk, centroid_lat, centroid_lng, boundary_geojson")
        .in_("slug", slugs)
        .execute()
    )
    return res.data or []


def slug_id_map() -> dict[str, str]:
    res = get_supabase().table("raions").select("id, slug").execute()
    return {row["slug"]: row["id"] for row in res.data or []}


def upsert_raion(row: dict[str, Any]) -> dict[str, Any]:
    res = get_supabase().table("raions").upsert(row, on_conflict="slug").execute()
    return res.data[0]
