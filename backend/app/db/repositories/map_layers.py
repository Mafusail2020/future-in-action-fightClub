"""Data access for precomputed map overlay layers."""

from __future__ import annotations

from datetime import UTC, datetime

from supabase import Client


class MapLayersRepository:
    def __init__(self, client: Client):
        self.client = client

    def modes_for_city(self, city_id: str) -> list[dict]:
        """Available modes only — never the jsonb payload (rows can be ~1 MB)."""
        return (
            self.client.table("map_layers")
            .select("mode, generated_at")
            .eq("city_id", city_id)
            .execute()
            .data
        )

    def get(self, city_id: str, mode: str) -> dict | None:
        rows = (
            self.client.table("map_layers")
            .select("*")
            .eq("city_id", city_id)
            .eq("mode", mode)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def upsert(self, city_id: str, mode: str, feature_collection: dict, meta: dict) -> dict:
        row = {
            "city_id": city_id,
            "mode": mode,
            "feature_collection": feature_collection,
            "meta": meta,
            # Explicit so re-running the build script refreshes the timestamp.
            "generated_at": datetime.now(UTC).isoformat(),
        }
        return (
            self.client.table("map_layers")
            .upsert(row, on_conflict="city_id,mode")
            .execute()
            .data[0]
        )
