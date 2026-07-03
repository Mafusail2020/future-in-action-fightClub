from typing import Any

from app.db.client import get_supabase


def insert_metrics(rows: list[dict[str, Any]]) -> None:
    if rows:
        get_supabase().table("raion_metrics").insert(rows).execute()


def get_metrics(raion_id: str, metric: str | None = None,
                limit: int = 100) -> list[dict[str, Any]]:
    q = (
        get_supabase()
        .table("raion_metrics")
        .select("metric, value, unit, measured_at")
        .eq("raion_id", raion_id)
        .order("measured_at", desc=True)
        .limit(limit)
    )
    if metric:
        q = q.eq("metric", metric)
    res = q.execute()
    return res.data or []


def insert_features(rows: list[dict[str, Any]]) -> None:
    if rows:
        get_supabase().table("map_features").insert(rows).execute()


def get_features(raion_id: str | None = None, feature_type: str | None = None,
                 document_ids: list[str] | None = None, limit: int = 200) -> list[dict[str, Any]]:
    q = (
        get_supabase()
        .table("map_features")
        .select("id, raion_id, feature_type, label, geometry, properties, document_id")
        .limit(limit)
    )
    if raion_id:
        q = q.eq("raion_id", raion_id)
    if feature_type:
        q = q.eq("feature_type", feature_type)
    if document_ids:
        q = q.in_("document_id", document_ids)
    res = q.execute()
    return res.data or []
