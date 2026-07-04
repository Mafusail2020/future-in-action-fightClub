"""Unit tests for the matching pipeline with a mocked LLM (no network, no DB)."""

from app.agent.pipeline import Agent
from app.domain.categories import Category
from app.domain.models import CityProfile


class FakeLLM:
    """Stand-in for the Anthropic wrapper; returns canned structured output."""

    def __init__(self, match_output):
        self._match_output = match_output

    def structured(self, system, prompt, schema, **kwargs):
        return self._match_output


class FakeSolutionsRepo:
    def __init__(self, rows):
        self._rows = rows

    def by_categories(self, categories):
        if not categories:
            return self._rows
        return [r for r in self._rows if r["category"] in categories]


def _catalog():
    return [
        {
            "id": "sol-copenhagen",
            "city_id": "c1",
            "category": "transport",
            "title": "Cycle Superhighways",
            "problem": "car congestion",
            "solution": "bike network",
            "outcome": "more cycling",
            "source_urls": ["https://example.com/cph"],
            "tags": [],
            "city": {"id": "c1", "name": "Copenhagen", "country": "Denmark", "lat": 55.6, "lng": 12.5},
        },
        {
            "id": "sol-testville",
            "city_id": "c2",
            "category": "transport",
            "title": "Home Town Bus",
            "problem": "local",
            "solution": "buses",
            "outcome": "ok",
            "source_urls": [],
            "tags": [],
            "city": {"id": "c2", "name": "Testville", "country": "X", "lat": 0.0, "lng": 0.0},
        },
    ]


def _profile():
    return CityProfile(
        city="Testville",
        country="X",
        problem_domains=[Category.TRANSPORT],
        summary="a test city",
    )


def test_select_candidates_excludes_home_city():
    agent = Agent(llm=None, cities=None, solutions=FakeSolutionsRepo(_catalog()))
    candidates = agent.select_candidates(_profile())
    ids = {c["id"] for c in candidates}
    assert "sol-copenhagen" in ids
    assert "sol-testville" not in ids  # never recommend the user's own city


def test_match_hydrates_and_drops_hallucinated_ids():
    llm = FakeLLM(
        {
            "matches": [
                {"solution_id": "sol-copenhagen", "score": 0.9, "rationale": "fits", "adaptation_notes": "scale down"},
                {"solution_id": "does-not-exist", "score": 0.8, "rationale": "hallucinated"},
            ]
        }
    )
    agent = Agent(llm=llm, cities=None, solutions=FakeSolutionsRepo(_catalog()))
    profile = _profile()
    candidates = agent.select_candidates(profile)
    matches = agent.match(profile, candidates, limit=5)

    assert len(matches) == 1  # hallucinated id dropped
    m = matches[0]
    assert m.solution_id == "sol-copenhagen"
    assert m.solution is not None
    assert m.solution.city.name == "Copenhagen"
    assert 0.0 <= m.score <= 1.0
