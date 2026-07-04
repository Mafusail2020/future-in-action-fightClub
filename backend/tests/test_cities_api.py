"""Cities/cases endpoints — repository layer monkeypatched, shapes asserted."""

from fastapi.testclient import TestClient

import app.api.v1.cities as cities_module
from app.main import app

CITY = {"id": "c-1", "slug": "vilnius", "name": "Вільнюс", "country": "Литва",
        "lat": 54.6872, "lng": 25.2797, "population": 580_000, "case_count": 2}
CASE_SUMMARY = {"id": "k-1", "title": "Tvarkau miestą", "problem_domain": "roads",
                "year_start": 2013, "year_end": None, "outcome": "100k заявок вирішено"}
CASE_DETAIL = {
    "id": "k-1", "title": "Tvarkau miestą", "problem_domain": "roads",
    "problem_summary": "Заявки губилися", "solution_summary": "Застосунок",
    "outcome": "100k заявок", "cost_estimate": None, "year_start": 2013,
    "year_end": None, "source_urls": ["https://tvarkaumiesta.lt"],
    "full_text": "## Проблема\n...",
    "cities": {"id": "c-1", "name": "Вільнюс", "country": "Литва", "population": 580_000},
}


def test_list_cities(monkeypatch):
    monkeypatch.setattr(cities_module.solutions_repo,
                        "list_cities_with_case_counts", lambda: [CITY])
    body = TestClient(app).get("/api/v1/cities").json()
    assert body == [CITY]


def test_list_city_cases(monkeypatch):
    monkeypatch.setattr(cities_module.solutions_repo,
                        "list_cases_by_city", lambda city_id: [CASE_SUMMARY])
    body = TestClient(app).get("/api/v1/cities/c-1/cases").json()
    assert body[0]["title"] == "Tvarkau miestą"


def test_get_case_and_404(monkeypatch):
    monkeypatch.setattr(cities_module.solutions_repo,
                        "get_case", lambda case_id: dict(CASE_DETAIL))
    body = TestClient(app).get("/api/v1/cases/k-1").json()
    assert body["city"]["name"] == "Вільнюс"
    assert body["full_text"].startswith("## Проблема")

    monkeypatch.setattr(cities_module.solutions_repo, "get_case", lambda case_id: None)
    assert TestClient(app).get("/api/v1/cases/missing").status_code == 404
