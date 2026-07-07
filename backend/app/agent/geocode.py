"""Geocoding tool: resolves streets/addresses/POIs to coordinates via Nominatim.

Gives the map director street-level reach: the model geocodes a place the user
named, then fires direct_map ops with the returned lat/lng. Failures come back
as JSON error strings — a geocode miss must never break the answer stream.
"""

from __future__ import annotations

import json

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_TIMEOUT_S = 8
# Nominatim usage policy requires an identifying User-Agent.
_HEADERS = {"User-Agent": "city-solutions-aggregator/0.1 (hackathon demo)"}

GEOCODE_TOOL: dict = {
    "name": "geocode_place",
    "description": (
        "Resolve a street, address, square, park, or other place INSIDE a city to map "
        "coordinates (lat/lng). Use when the user asks to see something more specific than a "
        "whole city — then point at it with direct_map using the returned lat/lng. The city "
        "and country are appended automatically when you set within_user_city=true (default); "
        "for a place in another city, put the city name into the query yourself."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "maxLength": 200,
                "description": "The place to find, e.g. 'провулок Художника Канцерова'",
            },
            "within_user_city": {
                "type": "boolean",
                "description": "Append the user's city+country to the query (default true)",
            },
        },
        "required": ["query"],
    },
}


def geocode(query: str, city: str | None = None, country: str | None = None) -> str:
    """Returns a JSON string for the tool_result: top matches or an error."""
    q = query.strip()
    if not q:
        return json.dumps({"error": "empty query"})
    if city:
        q = f"{q}, {city}"
    if country:
        q = f"{q}, {country}"

    try:
        response = httpx.get(
            NOMINATIM_URL,
            params={"q": q, "format": "jsonv2", "limit": 3},
            headers=_HEADERS,
            timeout=_TIMEOUT_S,
        )
        response.raise_for_status()
        rows = response.json()
    except Exception as exc:  # network/parse issues degrade to an honest miss
        return json.dumps({"error": f"geocoding failed: {type(exc).__name__}"})

    if not rows:
        return json.dumps(
            {"results": [], "note": "nothing found — tell the user instead of guessing"},
            ensure_ascii=False,
        )
    results = [
        {
            "name": row.get("display_name", ""),
            "lat": float(row["lat"]),
            "lng": float(row["lon"]),
            "kind": row.get("type", ""),
        }
        for row in rows
        if "lat" in row and "lon" in row
    ]
    return json.dumps({"results": results}, ensure_ascii=False)
