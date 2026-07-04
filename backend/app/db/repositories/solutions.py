"""Data access for solutions."""

from __future__ import annotations

from supabase import Client


class SolutionsRepository:
    def __init__(self, client: Client):
        self.client = client

    def list(
        self,
        category: str | None = None,
        city_id: str | None = None,
        q: str | None = None,
    ) -> list[dict]:
        query = self.client.table("solutions").select("*")
        if category:
            query = query.eq("category", category)
        if city_id:
            query = query.eq("city_id", city_id)
        if q:
            like = f"%{q}%"
            query = query.or_(f"title.ilike.{like},problem.ilike.{like},solution.ilike.{like}")
        return query.order("created_at", desc=True).execute().data

    def list_all(self) -> list[dict]:
        """Full catalog for the agent. Joins the city so matches carry coordinates."""
        return self.client.table("solutions").select("*, city:cities(*)").execute().data

    def by_categories(self, categories: list[str]) -> list[dict]:
        if not categories:
            return self.list_all()
        return (
            self.client.table("solutions")
            .select("*, city:cities(*)")
            .in_("category", categories)
            .execute()
            .data
        )

    def get(self, solution_id: str) -> dict | None:
        rows = (
            self.client.table("solutions")
            .select("*, city:cities(*)")
            .eq("id", solution_id)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def by_city(self, city_id: str) -> list[dict]:
        return self.client.table("solutions").select("*").eq("city_id", city_id).execute().data

    def insert(self, solution: dict) -> dict:
        return (
            self.client.table("solutions")
            .upsert(solution, on_conflict="city_id,title")
            .execute()
            .data[0]
        )
