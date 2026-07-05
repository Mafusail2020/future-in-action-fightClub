"""Map-layers endpoints: registry decoration, 404s, endpoint-local gzip."""

from fastapi.testclient import TestClient

from app.dependencies import get_cities_repo, get_map_layers_repo
from app.main import app

CITY_ID = "c-zhytomyr"

_BIG_FC = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"type": "MultiLineString", "coordinates": [[[28.6, 50.25], [28.7, 50.26]]]},
            "properties": {"name": f"вулиця {i}", "condition": 0.5},
        }
        for i in range(60)  # comfortably above the 2 KB gzip threshold
    ],
}


class FakeCitiesRepo:
    def get(self, city_id):
        return {"id": CITY_ID, "name": "Zhytomyr", "country": "Ukraine"} if city_id == CITY_ID else None


class FakeLayersRepo:
    def modes_for_city(self, city_id):
        return [
            {"mode": "road_condition", "generated_at": "2026-07-05T00:00:00+00:00"},
            {"mode": "ghost_mode", "generated_at": "2026-07-05T00:00:00+00:00"},  # left the registry
        ]

    def get(self, city_id, mode):
        if city_id == CITY_ID and mode == "road_condition":
            return {
                "city_id": CITY_ID,
                "mode": "road_condition",
                "generated_at": "2026-07-05T00:00:00+00:00",
                "meta": {"feature_count": 60, "ai_estimate": True},
                "feature_collection": _BIG_FC,
            }
        return None


def _client() -> TestClient:
    app.dependency_overrides[get_cities_repo] = lambda: FakeCitiesRepo()
    app.dependency_overrides[get_map_layers_repo] = lambda: FakeLayersRepo()
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_list_modes_decorates_from_registry_and_skips_unknown():
    response = _client().get(f"/api/v1/cities/{CITY_ID}/map-modes")
    assert response.status_code == 200
    modes = response.json()
    assert [m["mode"] for m in modes] == ["road_condition"]  # ghost_mode skipped
    assert modes[0]["label"] == "Стан доріг"
    assert modes[0]["kind"] == "line"
    assert modes[0]["value_prop"] == "condition"
    assert modes[0]["temporal"] is False


def test_list_modes_unknown_city_404():
    assert _client().get("/api/v1/cities/nope/map-modes").status_code == 404


def test_layer_unknown_mode_404():
    assert _client().get(f"/api/v1/cities/{CITY_ID}/map-modes/wat").status_code == 404


def test_layer_missing_row_404():
    assert _client().get(f"/api/v1/cities/{CITY_ID}/map-modes/traffic").status_code == 404


def test_layer_happy_path_is_gzipped():
    response = _client().get(
        f"/api/v1/cities/{CITY_ID}/map-modes/road_condition",
        headers={"Accept-Encoding": "gzip"},
    )
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
    data = response.json()  # httpx transparently decompresses
    assert data["mode"] == "road_condition"
    assert data["city_id"] == CITY_ID
    assert len(data["feature_collection"]["features"]) == 60


def test_layer_without_gzip_accept_is_plain():
    response = _client().get(
        f"/api/v1/cities/{CITY_ID}/map-modes/road_condition",
        headers={"Accept-Encoding": "identity"},
    )
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.json()["meta"]["ai_estimate"] is True
