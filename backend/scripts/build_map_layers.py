"""Precompute map overlay layers: OSM geometry + LLM scores -> map_layers table.

Idempotent: Overpass responses are cached on disk (data/raw/osm/) and rows are
upserted on (city_id, mode). Roughly 10 LLM calls per city for all three modes.

Usage (from the backend/ directory, with .env configured):
    uv run python -m scripts.build_map_layers --city "Zhytomyr,Ukraine" --city "Vienna,Austria"
    uv run python -m scripts.build_map_layers --city "Zhytomyr,Ukraine" --lat 50.2547 --lng 28.6587
    uv run python -m scripts.build_map_layers --all --modes traffic --radius-km 6
"""

from __future__ import annotations

import argparse
import re

from app.agent.llm import LLM, load_prompt, make_llm
from app.db.client import get_supabase
from app.db.repositories.cities import CitiesRepository
from app.db.repositories.map_layers import MapLayersRepository
from app.domain.map_modes import MapMode
from app.ingestion import features as feat
from app.ingestion import overpass

# mode -> how to build and score it. A new mode = one entry here + a prompt file.
MODE_SPECS: dict[str, dict] = {
    MapMode.POPULATION_DENSITY: {
        "prompt": "map_population_density.md",
        "geometry": "districts",
        "batch_size": 40,
        "max_tokens": 4096,
        "item_schema": {
            "type": "object",
            "required": ["name", "density"],
            "properties": {
                "name": {"type": "string"},
                "density": {"type": "number", "minimum": 0, "maximum": 1},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            },
        },
    },
    MapMode.ROAD_CONDITION: {
        "prompt": "map_road_condition.md",
        "geometry": "roads",
        "batch_size": 40,
        "max_tokens": 4096,
        "item_schema": {
            "type": "object",
            "required": ["name", "condition"],
            "properties": {
                "name": {"type": "string"},
                "condition": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
    },
    MapMode.TRAFFIC: {
        "prompt": "map_traffic.md",
        "geometry": "roads",
        # 24 floats per street crowd the output budget — smaller batches, more tokens.
        "batch_size": 20,
        "max_tokens": 8192,
        "item_schema": {
            "type": "object",
            "required": ["name", "hours"],
            "properties": {
                "name": {"type": "string"},
                "hours": {
                    "type": "array",
                    "items": {"type": "number"},
                    "minItems": 24,
                    "maxItems": 24,
                },
            },
        },
    },
}


def _clamp01(value) -> float | None:
    """0..1 float, or None when the model sent junk (str/None/…)."""
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return None


def score_props(mode: str, score: dict) -> dict | None:
    """Turn one LLM score item into feature properties; None = unusable item."""
    if mode == MapMode.POPULATION_DENSITY:
        density = _clamp01(score.get("density"))
        if density is None:
            return None
        props = {"density": density}
        if score.get("confidence"):
            props["confidence"] = score["confidence"]
        return props
    if mode == MapMode.ROAD_CONDITION:
        condition = _clamp01(score.get("condition"))
        return None if condition is None else {"condition": condition}
    if mode == MapMode.TRAFFIC:
        hours = score.get("hours")
        if not isinstance(hours, list) or len(hours) != 24:
            return None
        clamped = [_clamp01(v) for v in hours]
        if any(v is None for v in clamped):
            return None
        return {f"h{i}": v for i, v in enumerate(clamped)}
    return None


def batches(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def score_features(llm: LLM, mode: str, city: dict, features: list[dict]) -> int:
    """Score features in-place via batched structured() calls. Returns scored count.

    Names the LLM returns that were never sent are dropped (hallucination guard,
    same as the match pipeline). Unscored features keep no value prop -> gray.
    """
    spec = MODE_SPECS[mode]
    system = load_prompt(spec["prompt"])
    schema = {
        "type": "object",
        "required": ["scores"],
        "properties": {"scores": {"type": "array", "items": spec["item_schema"]}},
    }
    # Same name may map to several features (e.g. split street segments, or a
    # district that exists as both relation and place node) — score them all.
    by_name: dict[str, list[dict]] = {}
    for f in features:
        by_name.setdefault(f["properties"]["name"].lower(), []).append(f)

    scored_names: set[str] = set()
    unique_names = list(dict.fromkeys(f["properties"]["name"] for f in features))
    name_batches = batches(unique_names, spec["batch_size"])
    for i, batch in enumerate(name_batches):
        prompt = (
            f"City: {city['name']}\nCountry: {city['country']}\n\n"
            "Names:\n" + "\n".join(f"- {n}" for n in batch)
        )
        data = llm.structured(
            system=system, prompt=prompt, schema=schema, max_tokens=spec["max_tokens"]
        )
        applied = 0
        raw_scores = data.get("scores") if isinstance(data, dict) else None
        for score in raw_scores or []:
            # Schemas are advisory for nested arrays — models occasionally emit
            # bare strings or drop required keys. Junk items are skipped, never fatal.
            if not isinstance(score, dict):
                continue
            key = str(score.get("name", "")).lower()
            targets = by_name.get(key)
            if not targets:  # hallucinated or unrequested name
                continue
            props = score_props(mode, score)
            if props is None:
                continue
            for feature in targets:
                feature["properties"].update(props)
            if key not in scored_names:
                scored_names.add(key)
                applied += 1
        print(f"  batch {i + 1}/{len(name_batches)}: {applied}/{len(batch)} scored")
    return sum(len(by_name[k]) for k in scored_names)


def build_city_mode(
    llm: LLM,
    repo: MapLayersRepository,
    city: dict,
    mode: str,
    radius_km: float,
    force_refetch: bool,
) -> None:
    spec = MODE_SPECS[mode]
    box = overpass.bbox(city["lat"], city["lng"], radius_km)
    slug = re.sub(r"[^a-z0-9]+", "-", f"{city['name']}-{city['country']}".lower())
    cache_key = f"{slug}-{spec['geometry']}-r{radius_km:g}"

    if spec["geometry"] == "districts":
        raw = overpass.fetch(overpass.districts_query(box), cache_key, force=force_refetch)
        features = feat.districts_from_overpass(raw)
    else:
        raw = overpass.fetch(overpass.roads_query(box), cache_key, force=force_refetch)
        features = feat.roads_from_overpass(raw)

    if not features:
        print(f"  {mode}: no OSM features found, skipping")
        return

    print(f"  {mode}: {len(features)} features, scoring…")
    scored = score_features(llm, mode, city, features)

    if spec["geometry"] == "districts":
        # Ship the real administrative boundary with the layer (mosaic clipping).
        boundary_raw = overpass.fetch(
            overpass.city_boundary_query(box),
            f"{slug}-boundary",
            force=force_refetch,
        )
        boundary = feat.boundary_from_overpass(boundary_raw, (city["lat"], city["lng"]))
        if boundary:
            features = [*features, boundary]
            print(f"  {mode}: city boundary attached ({boundary['properties'].get('name')})")
        else:
            print(f"  {mode}: no admin boundary found — frontend falls back to hull")

    # upsert on (city_id, mode) overwrites every column — a re-run REPLACES the
    # layer wholesale (fresh geometry + fresh scores), it never merges into old data.
    repo.upsert(
        city_id=city["id"],
        mode=mode,
        feature_collection={"type": "FeatureCollection", "features": features},
        meta={
            "feature_count": len(features),
            "scored_count": scored,
            "ai_estimate": True,
            "model": llm.model,
            "radius_km": radius_km,
        },
    )
    print(f"  {mode}: upserted ({scored}/{len(features)} scored)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", action="append", default=[], metavar="NAME,COUNTRY")
    parser.add_argument("--all", action="store_true", help="every city in the DB")
    parser.add_argument("--modes", default=",".join(MODE_SPECS), help="csv of modes")
    parser.add_argument("--radius-km", type=float, default=8.0)
    parser.add_argument("--force-refetch", action="store_true", help="bypass Overpass cache")
    parser.add_argument("--lat", type=float, help="with a single --city: create it if missing")
    parser.add_argument("--lng", type=float)
    args = parser.parse_args()

    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    unknown = [m for m in modes if m not in MODE_SPECS]
    if unknown:
        parser.error(f"unknown modes: {unknown}; available: {list(MODE_SPECS)}")
    if not args.city and not args.all:
        parser.error("pass --city 'Name,Country' (repeatable) or --all")

    client = get_supabase()
    cities_repo = CitiesRepository(client)
    layers_repo = MapLayersRepository(client)
    llm = make_llm()  # Anthropic, or the OpenAI fallback when its key is absent

    cities: list[dict] = []
    if args.all:
        cities = cities_repo.list_with_counts()
    else:
        for spec in args.city:
            name, _, country = spec.partition(",")
            name, country = name.strip(), country.strip()
            if not country:
                parser.error(f"--city must be 'Name,Country', got: {spec!r}")
            city = cities_repo.find_by_name(name, country)
            if not city and args.lat is not None and args.lng is not None and len(args.city) == 1:
                city = cities_repo.get_or_create(
                    {"name": name, "country": country, "lat": args.lat, "lng": args.lng}
                )
            if not city:
                print(f"Skipping {name}, {country}: not in DB (pass --lat/--lng to create)")
                continue
            cities.append(city)

    for city in cities:
        print(f"{city['name']}, {city['country']}:")
        for mode in modes:
            build_city_mode(llm, layers_repo, city, mode, args.radius_km, args.force_refetch)

    print("Done.")


if __name__ == "__main__":
    main()
