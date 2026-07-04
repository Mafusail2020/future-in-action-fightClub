"""Load seed/solutions.json into Supabase.

Idempotent: cities are deduped by (name, country) and solutions by (city, title),
so re-running updates rather than duplicates.

Usage (from the backend/ directory, with .env configured):
    uv run python -m scripts.load_seed
"""

from __future__ import annotations

import json
from pathlib import Path

from app.db.client import get_supabase
from app.db.repositories.cities import CitiesRepository
from app.db.repositories.solutions import SolutionsRepository

SEED_PATH = Path(__file__).resolve().parent.parent / "seed" / "solutions.json"


def main() -> None:
    client = get_supabase()
    cities = CitiesRepository(client)
    solutions = SolutionsRepository(client)

    entries = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    city_ids: set[str] = set()
    loaded = 0

    for entry in entries:
        city = cities.get_or_create(entry["city"])
        city_ids.add(city["id"])

        solution = {k: v for k, v in entry.items() if k != "city"}
        solution["city_id"] = city["id"]
        solutions.insert(solution)
        loaded += 1

    print(f"Loaded {loaded} solutions across {len(city_ids)} cities.")


if __name__ == "__main__":
    main()
