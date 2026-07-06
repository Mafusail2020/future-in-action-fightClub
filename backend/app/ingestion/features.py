"""Turn raw Overpass responses into GeoJSON Features.

Pure functions — fixture-testable, no network. Geometry is always OSM-derived;
the LLM only ever contributes scalar scores keyed by feature name.
"""

from __future__ import annotations

import math

# Highest first — a street keeps the most important class among its ways.
ROAD_CLASS_ORDER = [
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "unclassified",
]
ARTERIAL_CLASSES = set(ROAD_CLASS_ORDER[:5])

MAX_ROADS = 120
NODE_FALLBACK_RADIUS_KM = 0.7


# --- Geometry helpers -----------------------------------------------------------------

def round_coords(coords, ndigits: int = 5):
    """Recursively round [lng, lat] nesting; 5 digits ≈ 1.1 m."""
    if isinstance(coords[0], (int, float)):
        return [round(c, ndigits) for c in coords]
    return [round_coords(c, ndigits) for c in coords]


def _point_segment_dist(p, a, b) -> float:
    """Planar distance from p to segment ab (fine at city scale)."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points: list[list[float]], tolerance: float = 1e-4) -> list[list[float]]:
    """Douglas-Peucker. Applied to polygon rings only — roads keep their shape."""
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    max_dist, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = _point_segment_dist(points[i], start, end)
        if d > max_dist:
            max_dist, index = d, i
    if max_dist <= tolerance:
        return [start, end]
    left = simplify(points[: index + 1], tolerance)
    right = simplify(points[index:], tolerance)
    return left[:-1] + right


def _way_coords(element: dict) -> list[list[float]]:
    """Overpass `out geom` inline geometry -> GeoJSON [lng, lat] list."""
    return [[g["lon"], g["lat"]] for g in element.get("geometry") or []]


def _circle(lat: float, lng: float, radius_km: float, points: int = 24) -> list[list[float]]:
    """Closed ring approximating a circle — fallback geometry for place nodes."""
    dlat = radius_km / 110.6
    dlng = radius_km / (111.3 * math.cos(math.radians(lat)))
    ring = [
        [lng + dlng * math.cos(2 * math.pi * i / points), lat + dlat * math.sin(2 * math.pi * i / points)]
        for i in range(points)
    ]
    ring.append(ring[0])
    return ring


def _stitch_rings(ways: list[list[list[float]]]) -> list[list[list[float]]]:
    """Join outer-member ways of a relation into closed rings by endpoint matching."""
    remaining = [w for w in ways if len(w) >= 2]
    rings: list[list[list[float]]] = []
    while remaining:
        ring = remaining.pop(0)
        progress = True
        while ring[0] != ring[-1] and progress:
            progress = False
            for i, way in enumerate(remaining):
                if way[0] == ring[-1]:
                    ring = ring + way[1:]
                elif way[-1] == ring[-1]:
                    ring = ring + list(reversed(way))[1:]
                elif way[-1] == ring[0]:
                    ring = way + ring[1:]
                elif way[0] == ring[0]:
                    ring = list(reversed(way)) + ring[1:]
                else:
                    continue
                remaining.pop(i)
                progress = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
        # Unclosable fragments are dropped — the place-node fallback covers the area.
    return rings


# --- Districts ------------------------------------------------------------------------

def districts_from_overpass(data: dict) -> list[dict]:
    """Named district polygons.

    Fallback chain: admin relations -> closed place ways -> circles around place
    nodes. Many cities (Zhytomyr included) have no admin_level 9/10 relations in
    OSM, so the node fallback is load-bearing.
    """
    by_name: dict[str, dict] = {}  # name -> feature; earlier sources win

    def add(name: str, geometry: dict, source_rank: int):
        existing = by_name.get(name)
        if existing and existing["properties"]["_rank"] <= source_rank:
            return
        by_name[name] = {
            "type": "Feature",
            "geometry": geometry,
            "properties": {"name": name, "_rank": source_rank},
        }

    for el in data.get("elements", []):
        name = (el.get("tags") or {}).get("name")
        if not name:
            continue

        if el["type"] == "relation":
            outers = [
                _way_coords(m)
                for m in el.get("members", [])
                if m.get("role") == "outer" and m.get("geometry")
            ]
            rings = _stitch_rings(outers)
            if not rings:
                continue
            rings = [round_coords(simplify(r), 5) for r in rings]
            geometry = (
                {"type": "Polygon", "coordinates": [rings[0]]}
                if len(rings) == 1
                else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
            )
            add(name, geometry, 0)

        elif el["type"] == "way":
            coords = _way_coords(el)
            if len(coords) >= 4 and coords[0] == coords[-1]:
                ring = round_coords(simplify(coords), 5)
                add(name, {"type": "Polygon", "coordinates": [ring]}, 1)

        elif el["type"] == "node":
            ring = round_coords(_circle(el["lat"], el["lon"], NODE_FALLBACK_RADIUS_KM), 5)
            add(name, {"type": "Polygon", "coordinates": [ring]}, 2)

    features = list(by_name.values())
    for f in features:
        del f["properties"]["_rank"]
    return features


# --- Roads ----------------------------------------------------------------------------

def _length(coords: list[list[float]]) -> float:
    return sum(
        math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1])
        for i in range(len(coords) - 1)
    )


def roads_from_overpass(data: dict) -> list[dict]:
    """One MultiLineString Feature per named street, capped at MAX_ROADS.

    All arterials are kept; the remaining slots go to the longest residential
    streets (the ones the LLM is most likely to actually know).
    """
    by_name: dict[str, dict] = {}
    for el in data.get("elements", []):
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        name = tags.get("name")
        highway = tags.get("highway")
        if not name or highway not in ROAD_CLASS_ORDER:
            continue
        coords = round_coords(_way_coords(el), 5)
        if len(coords) < 2:
            continue
        entry = by_name.setdefault(name, {"lines": [], "class": highway, "length": 0.0})
        entry["lines"].append(coords)
        entry["length"] += _length(coords)
        if ROAD_CLASS_ORDER.index(highway) < ROAD_CLASS_ORDER.index(entry["class"]):
            entry["class"] = highway

    arterials = [(n, e) for n, e in by_name.items() if e["class"] in ARTERIAL_CLASSES]
    minors = sorted(
        ((n, e) for n, e in by_name.items() if e["class"] not in ARTERIAL_CLASSES),
        key=lambda item: -item[1]["length"],
    )
    chosen = arterials + minors[: max(0, MAX_ROADS - len(arterials))]

    return [
        {
            "type": "Feature",
            "geometry": {"type": "MultiLineString", "coordinates": entry["lines"]},
            "properties": {"name": name, "road_class": entry["class"]},
        }
        for name, entry in chosen
    ]


# --- City boundary ----------------------------------------------------------------

def _ring_area(ring: list[list[float]]) -> float:
    """Shoelace, abs value in deg² — only for picking the smallest relation."""
    total = 0.0
    for i in range(len(ring) - 1):
        total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(total) / 2


def _in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def boundary_from_overpass(data: dict, center: tuple[float, float]) -> dict | None:
    """The smallest administrative relation CONTAINING the center point —
    i.e. the actual city boundary. Feature tagged `_boundary: true`."""
    lat, lng = center
    best: tuple[float, dict] | None = None
    for el in data.get("elements", []):
        if el.get("type") != "relation":
            continue
        outers = [
            _way_coords(m)
            for m in el.get("members", [])
            if m.get("role") == "outer" and m.get("geometry")
        ]
        rings = _stitch_rings(outers)
        if not rings:
            continue
        rings = [round_coords(simplify(r, 5e-5), 5) for r in rings]
        if not any(_in_ring(lng, lat, r) for r in rings):
            continue  # bbox brushed it, but the city center is outside
        area = sum(_ring_area(r) for r in rings)
        geometry = (
            {"type": "Polygon", "coordinates": [rings[0]]}
            if len(rings) == 1
            else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        )
        name = (el.get("tags") or {}).get("name", "")
        feature = {
            "type": "Feature",
            "geometry": geometry,
            "properties": {"_boundary": True, "name": name},
        }
        if best is None or area < best[0]:
            best = (area, feature)
    return best[1] if best else None
