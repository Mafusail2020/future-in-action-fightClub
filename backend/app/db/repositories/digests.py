from typing import Any

from app.db.client import get_supabase


def get_current_digest(raion_id: str) -> dict[str, Any] | None:
    res = (
        get_supabase()
        .table("raion_digests")
        .select("id, raion_id, content, generated_at")
        .eq("raion_id", raion_id)
        .eq("is_current", True)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def save_digest(raion_id: str, content: str, embedding: list[float]) -> None:
    sb = get_supabase()
    sb.table("raion_digests").update({"is_current": False}).eq("raion_id", raion_id).execute()
    sb.table("raion_digests").insert(
        {"raion_id": raion_id, "content": content, "embedding": embedding, "is_current": True}
    ).execute()
