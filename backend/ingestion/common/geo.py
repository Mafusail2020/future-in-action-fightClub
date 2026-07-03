"""Assigning scraped items to city areas (raions)."""

import math
from functools import lru_cache

from app.db.repositories.raions import list_raions

# Beyond this a point is considered outside every mapped area (city-wide).
_MAX_KM = 4.0


@lru_cache
def _centroids() -> list[tuple[str, str, float, float]]:
    return [
        (r["slug"], r["name_uk"], r["centroid_lat"], r["centroid_lng"])
        for r in list_raions()
        if r.get("centroid_lat") is not None and r.get("centroid_lng") is not None
    ]


def nearest_raion(lat: float, lng: float) -> str | None:
    """Slug of the closest raion centroid, or None if everything is too far."""
    best_slug, best_km = None, _MAX_KM
    for slug, _name, clat, clng in _centroids():
        dlat = (lat - clat) * 110.574
        dlng = (lng - clng) * 111.320 * math.cos(math.radians(lat))
        km = math.hypot(dlat, dlng)
        if km < best_km:
            best_slug, best_km = slug, km
    return best_slug


def raion_by_mention(text: str) -> str | None:
    """First raion whose Ukrainian name is mentioned in the text (e.g. tender titles)."""
    lowered = text.lower()
    for slug, name_uk, _lat, _lng in _centroids():
        if name_uk.lower() in lowered:
            return slug
    return None
