from fastapi import APIRouter

from app.db.client import get_supabase

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    try:
        get_supabase().table("raions").select("id").limit(1).execute()
        database = "ok"
    except Exception as exc:
        database = f"error: {exc}"
    return {"status": "ok", "database": database}
