"""Overpass API client with on-disk caching, plus query builders.

Every raw response is cached under data/raw/osm/ so re-runs of the build script
never hit the network. Only scripts use this module — the API never does.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import httpx

from app.config import get_settings

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "osm"

_RETRY_STATUSES = {429, 504}
_RETRIES = 3
_RETRY_SLEEP_S = 30
_THROTTLE_S = 1.0

_last_call_at = 0.0


def bbox(lat: float, lng: float, radius_km: float) -> tuple[float, float, float, float]:
    """(south, west, north, east) box around a point."""
    dlat = radius_km / 110.6
    dlng = radius_km / (111.3 * math.cos(math.radians(lat)))
    return (lat - dlat, lng - dlng, lat + dlat, lng + dlng)


def districts_query(box: tuple[float, float, float, float]) -> str:
    s, w, n, e = box
    return f"""
[out:json][timeout:180];
(
  relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]({s},{w},{n},{e});
  way["place"~"^(suburb|quarter|neighbourhood)$"]({s},{w},{n},{e});
  node["place"~"^(suburb|quarter|neighbourhood)$"]({s},{w},{n},{e});
);
out geom;
"""


def roads_query(box: tuple[float, float, float, float]) -> str:
    s, w, n, e = box
    return f"""
[out:json][timeout:180];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"]
   ["name"]({s},{w},{n},{e});
out geom;
"""


def fetch(query: str, cache_key: str, force: bool = False) -> dict:
    """POST a query, or return the cached response for `cache_key`."""
    cache_path = CACHE_DIR / f"{cache_key}.json"
    if not force and cache_path.exists():
        return json.loads(cache_path.read_text())

    global _last_call_at
    url = get_settings().overpass_url
    for attempt in range(_RETRIES):
        wait = _THROTTLE_S - (time.monotonic() - _last_call_at)
        if wait > 0:
            time.sleep(wait)
        _last_call_at = time.monotonic()

        response = httpx.post(url, data={"data": query}, timeout=200)
        if response.status_code in _RETRY_STATUSES and attempt < _RETRIES - 1:
            print(f"  overpass {response.status_code}, retrying in {_RETRY_SLEEP_S}s…")
            time.sleep(_RETRY_SLEEP_S)
            continue
        response.raise_for_status()
        data = response.json()
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data, ensure_ascii=False))
        return data

    raise RuntimeError("Overpass retries exhausted")
