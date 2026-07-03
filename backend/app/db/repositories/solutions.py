"""Read-only access to the solutions layer (tables filled by the solutions ingestion)."""

from typing import Any

from app.db.client import get_supabase


def get_cases_by_ids(ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    res = (
        get_supabase()
        .table("solution_cases")
        .select("id, title, problem_domain, solution_summary, outcome, source_urls, "
                "cities(name, country, population)")
        .in_("id", ids)
        .execute()
    )
    return res.data or []
