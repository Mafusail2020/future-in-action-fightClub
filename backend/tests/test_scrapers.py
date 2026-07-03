"""API scrapers: parse() hooks against real captured payloads, cache TTL, geo
assignment, idempotent loading. Fully offline."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ingestion.common import geo, http
from ingestion.common.base_source import RawDoc, SourceOutput
from ingestion.sources.citybudget import CityBudgetSource, _parse_expenses, _parse_incomes
from ingestion.sources.prozorro import ProzorroSource
from ingestion.sources.saveecobot import SaveEcoBotSource

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


# --- SaveEcoBot ---------------------------------------------------------------

def test_saveecobot_parse_real_payload():
    out = SaveEcoBotSource().parse(_fixture("saveecobot_city.json"))

    metrics = {m["metric"]: m for m in out.metrics}
    assert metrics["air_quality_aqi"]["value"] == 43
    assert all(m["raion_slug"] is None for m in out.metrics)  # city-wide
    # pressure reading in the fixture is stale (is_old=true) -> must be skipped
    assert "pressure" not in metrics

    assert len(out.docs) == 1
    doc = out.docs[0]
    assert doc.external_id == "saveecobot-city-summary"
    assert "saveecobot.com" in doc.content  # attribution is a license requirement

    point = out.features[0]["geometry"]
    assert point["type"] == "Point"
    lng, lat = point["coordinates"]
    assert 28 < lng < 29 and 50 < lat < 51  # [lng, lat] order


def test_saveecobot_stale_aqi_dropped():
    payload = _fixture("saveecobot_city.json")
    payload["aqi_is_old"] = True
    out = SaveEcoBotSource().parse(payload)
    assert "air_quality_aqi" not in {m["metric"] for m in out.metrics}


# --- Prozorro -------------------------------------------------------------------

def test_prozorro_parse_filters_dedupes_categorizes(monkeypatch):
    monkeypatch.setattr(geo, "raion_by_mention", lambda text: None)
    out = ProzorroSource().parse(_fixture("prozorro_categories.json"))

    # village tender dropped, duplicated city tender deduped -> 2 docs
    assert len(out.docs) == 2
    by_id = {d.external_id: d for d in out.docs}
    road = by_id["UA-2026-06-20-000001-a"]
    assert road.category == "roads"  # the query that found it is the classifier
    assert road.url.endswith(road.external_id)
    assert "2 500 000" in road.content  # spaces, not commas, in uk numbers

    metrics = {m["metric"]: m["value"] for m in out.metrics}
    assert metrics["tenders_roads_count"] == 1
    assert metrics["tenders_utilities_value"] == 900000.5


# --- City budget ---------------------------------------------------------------

def test_citybudget_annex_row_parsers():
    income_rows = [
        ["Код", "Найменування", "Всього", "Загальний фонд", "Спеціальний фонд"],
        ["10000000", "Податкові надходження", 4273710536, 4271446900, 2263636],
        ["11010100", "ПДФО, що сплачується податковими агентами", 2683423800, 2683423800, None],
        ["Всього", None, 5100000000, None, None],
    ]
    parsed = _parse_incomes(income_rows)
    assert {r["code"]: r["total"] for r in parsed} == {
        "10000000": 4273710536.0, "Всього": 5100000000.0}

    expense_rows = [
        # merged-cell layout: ТПКВК/функціональна columns empty, name in col 4
        ["0200000", None, None, "Виконавчий комітет Житомирської міської ради",
         297558315, 247448473, 302821495],
        ["0210160", "0160", "0111", "Керівництво і управління", 163462792],  # not top-level
    ]
    parsed = _parse_expenses(expense_rows)
    assert parsed == [{"code": "0200000",
                       "name": "Виконавчий комітет Житомирської міської ради",
                       "total": 302821495.0}]


def test_citybudget_parse_products():
    raw = {
        "decision": "Рішення міської ради від 18.12.2025 № 1604 Про бюджет ... на 2026 рік",
        "year": 2026,
        "incomes": [
            {"code": "10000000", "name": "податкові надходження", "total": 4273710536.0},
            {"code": "Всього", "name": "всього", "total": 5100000000.0},
        ],
        "expenses": [
            {"code": "0200000", "name": "Виконавчий комітет", "total": 302821495.0},
        ],
    }
    out = CityBudgetSource().parse(raw)
    metrics = {m["metric"]: m["value"] for m in out.metrics}
    assert metrics["budget_income_total_2026"] == 5100000000.0
    assert metrics["budget_expense_total_2026"] == 302821495.0
    assert all(m["raion_slug"] is None for m in out.metrics)
    assert out.docs[0].external_id == "citybudget-2026"
    assert "4 273 710 536" in out.docs[0].content


# --- geo helpers -----------------------------------------------------------------

def test_geo_assignment(monkeypatch):
    monkeypatch.setattr(geo, "list_raions", lambda: [
        {"slug": "bohuniia", "name_uk": "Богунія", "centroid_lat": 50.2790, "centroid_lng": 28.6540},
        {"slug": "kroshnia", "name_uk": "Крошня", "centroid_lat": 50.2900, "centroid_lng": 28.6690},
    ])
    geo._centroids.cache_clear()
    try:
        assert geo.nearest_raion(50.2795, 28.6545) == "bohuniia"
        assert geo.nearest_raion(51.5, 30.0) is None  # far away -> city-wide
        assert geo.raion_by_mention("Ремонт дороги у районі Крошня, Житомир") == "kroshnia"
        assert geo.raion_by_mention("Без згадок районів") is None
    finally:
        geo._centroids.cache_clear()


# --- http cache -------------------------------------------------------------------

def test_http_cache_ttl(monkeypatch, tmp_path):
    monkeypatch.setattr(http, "CACHE_DIR", tmp_path)
    calls = []

    def fetch():
        calls.append(1)
        return {"n": len(calls)}

    assert http.cached("k", 1.0, fetch) == {"n": 1}
    assert http.cached("k", 1.0, fetch) == {"n": 1}  # warm cache, no refetch
    assert len(calls) == 1

    stale = {"fetched_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
             "payload": {"n": 0}}
    (tmp_path / "k.json").write_text(json.dumps(stale))
    assert http.cached("k", 1.0, fetch) == {"n": 2}       # TTL expired
    assert http.cached("k", None, fetch) == {"n": 2}      # ttl=None: never expires
    assert http.cached("k", None, fetch, force=True) == {"n": 3}


# --- loader idempotency ------------------------------------------------------------

def test_loader_replaces_doc_by_external_id(monkeypatch):
    from ingestion.common import loader

    deleted, inserted = [], []
    monkeypatch.setattr(loader.docs_repo, "upsert_source", lambda kind, name: "src-1")
    monkeypatch.setattr(loader.docs_repo, "delete_by_external_id",
                        lambda sid, eid: deleted.append((sid, eid)))
    monkeypatch.setattr(loader.docs_repo, "insert_document",
                        lambda row: inserted.append(row) or f"doc-{len(inserted)}")
    monkeypatch.setattr(loader.docs_repo, "insert_chunks", lambda rows: None)
    monkeypatch.setattr(loader.raions_repo, "slug_id_map", lambda: {})
    monkeypatch.setattr(loader, "chunk_text", lambda text: [])
    captured_metrics = []
    monkeypatch.setattr(loader.mf_repo, "insert_metrics",
                        lambda rows: captured_metrics.extend(rows))

    class _Src:
        kind, name = "api", "test"

    loader.load(_Src(), SourceOutput(
        docs=[RawDoc(title="t", content="c", doc_type="tender", external_id="UA-1"),
              RawDoc(title="no-eid", content="c", doc_type="article")],
        metrics=[{"raion_slug": None, "metric": "budget_income_total_2026", "value": 1.0},
                 {"raion_slug": "ghost", "metric": "dropped", "value": 2.0}],
    ))

    assert deleted == [("src-1", "UA-1")]  # only the external_id doc triggers replace
    assert inserted[0]["external_id"] == "UA-1" and inserted[1]["external_id"] is None
    # city-wide metric passes with NULL raion, unknown slug is dropped
    assert [m["metric"] for m in captured_metrics] == ["budget_income_total_2026"]
    assert captured_metrics[0]["raion_id"] is None


# --- raion_stats city-wide mode ------------------------------------------------------

def test_raion_stats_city_wide(monkeypatch):
    import app.agent.tools.raion_stats as rs

    monkeypatch.setattr(rs, "get_metrics", lambda raion_id, metric=None: [
        {"metric": "budget_income_total_2026", "value": 5100000000.0,
         "unit": "грн", "measured_at": "2026-07-03T10:00:00+00:00"},
    ] if raion_id is None else [])
    monkeypatch.setattr(rs, "slug_id_map", lambda: {})

    payload = json.loads(rs.raion_stats.invoke({}))
    assert payload["items"][0]["id"] == "metric:misto:budget_income_total_2026"
    assert "5100000000" in payload["items"][0]["content"]
