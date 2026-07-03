"""Seed the `raions` table with Zhytomyr microdistricts.

Primary source: OSM place=suburb|neighbourhood|quarter within ~8 km of the center.
OSM coverage of Zhytomyr suburbs is spotty, so a curated list fills the gaps.
Boundaries are approximate circles — good enough for map highlighting at demo scale.

Run from backend/:  uv run python -m scripts.seed_raions
"""

import math

from app.db.repositories.raions import upsert_raion
from ingestion.common.overpass import (
    ZHYTOMYR_CENTER,
    circle_polygon,
    element_center,
    query,
    slugify,
)

# (name_uk, lat, lng, radius_km) — approximate centroids of well-known microdistricts.
CURATED = [
    ("Центр", 50.2547, 28.6587, 0.9),
    ("Богунія", 50.2790, 28.6540, 1.5),
    ("Крошня", 50.2900, 28.6690, 1.5),
    ("Мальованка", 50.2440, 28.6280, 1.2),
    ("Корбутівка", 50.2370, 28.6090, 1.2),
    ("Полісся", 50.2680, 28.6980, 1.2),
    ("Смолянка", 50.2610, 28.7090, 1.2),
    ("Хінчанка", 50.2660, 28.6440, 1.0),
    ("Видумка", 50.2350, 28.6890, 1.0),
    ("Східний", 50.2500, 28.7200, 1.2),
]

_RADIUS_BY_PLACE = {"suburb": 1.5, "neighbourhood": 0.9, "quarter": 0.7}

SUBURBS_QL = f"""
[out:json][timeout:60];
(
  node(around:8000,{ZHYTOMYR_CENTER[0]},{ZHYTOMYR_CENTER[1]})["place"~"^(suburb|neighbourhood|quarter)$"];
  way(around:8000,{ZHYTOMYR_CENTER[0]},{ZHYTOMYR_CENTER[1]})["place"~"^(suburb|neighbourhood|quarter)$"];
  relation(around:8000,{ZHYTOMYR_CENTER[0]},{ZHYTOMYR_CENTER[1]})["place"~"^(suburb|neighbourhood|quarter)$"];
);
out center tags;
"""


def collect_areas() -> list[dict]:
    areas: dict[str, dict] = {}

    try:
        payload = query(SUBURBS_QL, cache_key="suburbs")
        elements = payload.get("elements", [])
    except Exception as exc:  # Overpass flaky under load — curated list still seeds
        print(f"! Overpass failed ({exc}), falling back to curated list only")
        elements = []

    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name:uk") or tags.get("name")
        center = element_center(el)
        if not name or not center:
            continue
        population = None
        if str(tags.get("population", "")).isdigit():
            population = int(tags["population"])
        areas[name.strip().lower()] = {
            "name_uk": name.strip(),
            "lat": center[0],
            "lng": center[1],
            "radius_km": _RADIUS_BY_PLACE.get(tags.get("place"), 1.2),
            "population": population,
        }

    for name, lat, lng, radius in CURATED:
        areas.setdefault(name.lower(), {
            "name_uk": name, "lat": lat, "lng": lng, "radius_km": radius, "population": None,
        })

    return list(areas.values())


def main() -> None:
    areas = collect_areas()
    print(f"Seeding {len(areas)} areas...")
    for area in areas:
        slug = slugify(area["name_uk"])
        row = upsert_raion({
            "slug": slug,
            "name_uk": area["name_uk"],
            "name_en": slug.replace("-", " ").title(),
            "centroid_lat": area["lat"],
            "centroid_lng": area["lng"],
            "boundary_geojson": circle_polygon(area["lat"], area["lng"], area["radius_km"]),
            "population": area["population"],
            "area_km2": round(math.pi * area["radius_km"] ** 2, 2),
        })
        print(f"  {slug:<20} {row['name_uk']}")
    print("Done.")


if __name__ == "__main__":
    main()
