"""Cache of generated city profiles."""

from __future__ import annotations

from supabase import Client


def profile_key(city: str, country: str) -> str:
    return f"{city.strip().lower()}|{country.strip().lower()}"


class ProfilesRepository:
    def __init__(self, client: Client):
        self.client = client

    def get(self, city: str, country: str) -> dict | None:
        key = profile_key(city, country)
        rows = self.client.table("profiles").select("*").eq("key", key).limit(1).execute().data
        return rows[0]["profile"] if rows else None

    def set(self, city: str, country: str, profile: dict) -> None:
        key = profile_key(city, country)
        self.client.table("profiles").upsert({"key": key, "profile": profile}).execute()

    # Deep dossier reuses the same jsonb cache under a distinct key namespace,
    # so no extra table/migration is needed.
    def get_dossier(self, city: str, country: str) -> dict | None:
        key = "dossier|" + profile_key(city, country)
        rows = self.client.table("profiles").select("*").eq("key", key).limit(1).execute().data
        return rows[0]["profile"] if rows else None

    def set_dossier(self, city: str, country: str, dossier: dict) -> None:
        key = "dossier|" + profile_key(city, country)
        self.client.table("profiles").upsert({"key": key, "profile": dossier}).execute()
