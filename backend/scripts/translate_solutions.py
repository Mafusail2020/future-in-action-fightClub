"""Update existing solution rows in place with translated seed content.

Non-destructive: matches each seed entry to its live row by shared source_urls
(stable across the translation — titles changed, URLs did not), then UPDATEs the
text fields. Preserves solution ids and their embedding chunks (chunks keep their
old embeddings until `embed_solutions` is re-run with an OPENAI_API_KEY).

Falls back to insert for any seed entry with no URL match (new/drifted rows).

Usage (from backend/):
    uv run python -m scripts.translate_solutions
"""

from __future__ import annotations

import json
from pathlib import Path

from app.db.client import get_supabase
from app.db.repositories.cities import CitiesRepository

SEED_PATH = Path(__file__).resolve().parent.parent / "seed" / "solutions.json"

FIELDS = (
    "category",
    "title",
    "problem",
    "solution",
    "outcome",
    "cost",
    "year_start",
    "year_end",
    "source_urls",
    "tags",
)


def main() -> None:
    client = get_supabase()
    cities = CitiesRepository(client)

    entries = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    existing = client.table("solutions").select("id, source_urls, city_id").execute().data

    # url -> row id (first URL of each row is unique across the catalog)
    url_to_id: dict[str, str] = {}
    for row in existing:
        for url in row.get("source_urls") or []:
            url_to_id.setdefault(url, row["id"])

    updated = inserted = 0
    for entry in entries:
        payload = {k: entry[k] for k in FIELDS if k in entry}
        match_id = next(
            (url_to_id[u] for u in entry.get("source_urls", []) if u in url_to_id),
            None,
        )
        if match_id:
            client.table("solutions").update(payload).eq("id", match_id).execute()
            updated += 1
        else:
            city = cities.get_or_create(entry["city"])
            payload["city_id"] = city["id"]
            client.table("solutions").upsert(payload, on_conflict="city_id,title").execute()
            inserted += 1

    print(f"Updated {updated} rows in place, inserted {inserted} new.")


if __name__ == "__main__":
    main()
