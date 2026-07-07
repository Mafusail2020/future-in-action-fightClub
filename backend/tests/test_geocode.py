"""Coordinate map ops + geocode tool, fully offline (httpx monkeypatched)."""

import json

import httpx

import app.agent.geocode as gc
from app.agent.map_ops import validate_op

KNOWN = {"c-zhytomyr"}


# --- coordinate-anchored ops ------------------------------------------------------


def test_zoom_to_accepts_coords_without_target():
    op = validate_op({"op": "zoom_to", "lat": 50.2547, "lng": 28.6587, "zoom": 16}, KNOWN)
    assert op == {"op": "zoom_to", "lat": 50.2547, "lng": 28.6587, "zoom": 16}


def test_zoom_to_rejects_both_or_neither():
    assert validate_op({"op": "zoom_to"}, KNOWN) is None
    assert (
        validate_op({"op": "zoom_to", "target": "c-zhytomyr", "lat": 50.0, "lng": 28.0}, KNOWN)
        is None
    )


def test_zoom_to_coords_range_validated():
    assert validate_op({"op": "zoom_to", "lat": 95.0, "lng": 28.0}, KNOWN) is None


def test_zoom_allows_street_level():
    op = validate_op({"op": "zoom_to", "target": "home", "zoom": 17.5}, KNOWN)
    assert op is not None and op["zoom"] == 17.5


def test_mark_and_callout_accept_point_anchor():
    mark = validate_op({"op": "mark", "lat": 50.25, "lng": 28.65, "label": "тут"}, KNOWN)
    assert mark is not None and "city_id" not in mark
    callout = validate_op({"op": "callout", "lat": 50.25, "lng": 28.65, "text": "Ось"}, KNOWN)
    assert callout is not None and callout["lat"] == 50.25


def test_mark_still_requires_known_city_when_id_used():
    assert validate_op({"op": "mark", "city_id": "c-atlantis"}, KNOWN) is None
    assert validate_op({"op": "mark", "city_id": "c-zhytomyr"}, KNOWN) is not None


def test_mark_rejects_missing_anchor():
    assert validate_op({"op": "mark"}, KNOWN) is None


# --- geocode executor -------------------------------------------------------------


def test_geocode_appends_city_and_parses(monkeypatch):
    captured: dict = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        captured["q"] = params["q"]
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            json=[{"display_name": "провулок Художника Канцерова, Житомир",
                   "lat": "50.2531", "lon": "28.6702", "type": "residential"}],
            request=request,
        )

    monkeypatch.setattr(gc.httpx, "get", fake_get)
    out = json.loads(gc.geocode("провулок Художника Канцерова", "Zhytomyr", "Ukraine"))

    assert captured["q"] == "провулок Художника Канцерова, Zhytomyr, Ukraine"
    assert out["results"][0]["lat"] == 50.2531
    assert out["results"][0]["lng"] == 28.6702


def test_geocode_miss_and_failure_return_json(monkeypatch):
    def fake_empty(url, **kwargs):
        return httpx.Response(200, json=[], request=httpx.Request("GET", url))

    monkeypatch.setattr(gc.httpx, "get", fake_empty)
    assert json.loads(gc.geocode("невідоме місце"))["results"] == []

    def fake_boom(url, **kwargs):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(gc.httpx, "get", fake_boom)
    assert "error" in json.loads(gc.geocode("щось"))

    assert "error" in json.loads(gc.geocode("   "))  # empty query, no network touched
