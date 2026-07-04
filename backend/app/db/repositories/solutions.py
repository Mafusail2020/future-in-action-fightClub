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


def list_cities_with_case_counts() -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("cities")
        .select("id, slug, name, country, lat, lng, population, solution_cases(count)")
        .order("name")
        .execute()
    )
    rows = res.data or []
    for row in rows:
        counts = row.pop("solution_cases", None) or []
        row["case_count"] = counts[0]["count"] if counts else 0
    return rows


def list_cases_by_city(city_id: str) -> list[dict[str, Any]]:
    res = (
        get_supabase()
        .table("solution_cases")
        .select("id, title, problem_domain, year_start, year_end, outcome")
        .eq("city_id", city_id)
        .order("year_start", desc=True)
        .execute()
    )
    return res.data or []


def get_case(case_id: str) -> dict[str, Any] | None:
    res = (
        get_supabase()
        .table("solution_cases")
        .select("id, title, problem_domain, problem_summary, solution_summary, outcome, "
                "cost_estimate, year_start, year_end, source_urls, full_text, "
                "cities(id, name, country, population)")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None
