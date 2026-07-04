"""Data access for cities."""

from __future__ import annotations

from supabase import Client


class CitiesRepository:
    def __init__(self, client: Client):
        self.client = client

    def list_with_counts(self) -> list[dict]:
        """All cities, each annotated with how many solutions it has."""
        cities = self.client.table("cities").select("*").execute().data
        sols = self.client.table("solutions").select("city_id").execute().data
        counts: dict[str, int] = {}
        for s in sols:
            counts[s["city_id"]] = counts.get(s["city_id"], 0) + 1
        for c in cities:
            c["solution_count"] = counts.get(c["id"], 0)
        return cities

    def get(self, city_id: str) -> dict | None:
        rows = self.client.table("cities").select("*").eq("id", city_id).limit(1).execute().data
        return rows[0] if rows else None

    def find_by_name(self, name: str, country: str) -> dict | None:
        # ilike without wildcards gives a case-insensitive exact match.
        rows = (
            self.client.table("cities")
            .select("*")
            .ilike("name", name)
            .ilike("country", country)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def insert(self, city: dict) -> dict:
        return self.client.table("cities").insert(city).execute().data[0]

    def get_or_create(self, city: dict) -> dict:
        existing = self.find_by_name(city["name"], city["country"])
        if existing:
            return existing
        return self.insert(city)
