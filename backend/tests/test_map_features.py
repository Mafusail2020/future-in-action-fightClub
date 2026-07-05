"""Overpass -> GeoJSON feature builders, on checked-in fixtures (no network)."""

import json
from pathlib import Path

from app.ingestion.features import (
    districts_from_overpass,
    roads_from_overpass,
    round_coords,
    simplify,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_districts_fallback_chain():
    features = districts_from_overpass(_load("overpass_districts.json"))
    by_name = {f["properties"]["name"]: f for f in features}

    # relation outer ways stitched into one closed ring
    center = by_name["Центр"]
    assert center["geometry"]["type"] == "Polygon"
    ring = center["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]

    # closed place way becomes a polygon
    assert by_name["Полісся"]["geometry"]["type"] == "Polygon"

    # place node becomes a closed circle polygon
    circle = by_name["Корбутівка"]["geometry"]["coordinates"][0]
    assert circle[0] == circle[-1]
    assert len(circle) == 25  # 24 points + closure

    # nameless node is skipped
    assert len(features) == 3


def test_district_coords_are_rounded():
    features = districts_from_overpass(_load("overpass_districts.json"))
    polissia = next(f for f in features if f["properties"]["name"] == "Полісся")
    for lng, lat in polissia["geometry"]["coordinates"][0]:
        assert lng == round(lng, 5) and lat == round(lat, 5)


def test_roads_grouped_by_name_with_class_precedence():
    features = roads_from_overpass(_load("overpass_roads.json"))
    by_name = {f["properties"]["name"]: f for f in features}

    kyivska = by_name["вулиця Київська"]
    assert kyivska["geometry"]["type"] == "MultiLineString"
    assert len(kyivska["geometry"]["coordinates"]) == 2  # two ways, one street
    assert kyivska["properties"]["road_class"] == "primary"  # highest class wins

    assert "вулиця Тиха" in by_name
    # footway class and nameless ways are excluded
    assert "Стежка" not in by_name
    assert len(features) == 2


def test_simplify_drops_collinear_points():
    line = [[0.0, 0.0], [0.5, 0.00001], [1.0, 0.0]]
    assert simplify(line, tolerance=1e-4) == [[0.0, 0.0], [1.0, 0.0]]
    # a real corner survives
    corner = [[0.0, 0.0], [0.5, 0.5], [1.0, 0.0]]
    assert simplify(corner, tolerance=1e-4) == corner


def test_round_coords_nested():
    assert round_coords([[28.61234567, 50.25000004]]) == [[28.61235, 50.25]]
