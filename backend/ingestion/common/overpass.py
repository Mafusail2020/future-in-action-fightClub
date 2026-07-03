"""Overpass API client with on-disk caching, plus small geo helpers."""

import json
import math
import re
import time
from pathlib import Path

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
CACHE_DIR = Path("data/raw/osm")

# lat, lng of the city center (Soborna square area)
ZHYTOMYR_CENTER = (50.2547, 28.6587)

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e", "є": "ie",
    "ж": "zh", "з": "z", "и": "y", "і": "i", "ї": "i", "й": "i", "к": "k", "л": "l",
    "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ь": "",
    "ю": "iu", "я": "ia", "'": "", "’": "",
}


def query(ql: str, cache_key: str, force: bool = False) -> dict:
    """POST an Overpass QL query; cache the raw response under data/raw/osm/."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists() and not force:
        return json.loads(cache_file.read_text())

    response = httpx.post(OVERPASS_URL, data={"data": ql}, timeout=120)
    response.raise_for_status()
    payload = response.json()
    cache_file.write_text(json.dumps(payload, ensure_ascii=False))
    time.sleep(2)  # be polite to the public instance
    return payload


def slugify(name_uk: str) -> str:
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in name_uk.lower())
    return re.sub(r"[^a-z0-9]+", "-", latin).strip("-")


def circle_polygon(lat: float, lng: float, radius_km: float, points: int = 16) -> dict:
    """Approximate circular GeoJSON Polygon around a centroid. Coordinates are [lng, lat]."""
    dlat = radius_km / 110.574
    dlng = radius_km / (111.320 * math.cos(math.radians(lat)))
    ring = [
        [
            round(lng + dlng * math.sin(2 * math.pi * i / points), 6),
            round(lat + dlat * math.cos(2 * math.pi * i / points), 6),
        ]
        for i in range(points)
    ]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def element_center(element: dict) -> tuple[float, float] | None:
    """(lat, lng) of a node, or the 'center' of a way/relation from `out center`."""
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center")
    if center:
        return center["lat"], center["lon"]
    return None
