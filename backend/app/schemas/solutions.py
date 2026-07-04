"""API shapes for the world map: cities and their solved-problem cases."""

from pydantic import BaseModel


class CityOut(BaseModel):
    id: str
    slug: str | None = None
    name: str
    country: str
    lat: float | None = None
    lng: float | None = None
    population: int | None = None
    case_count: int = 0


class CaseSummaryOut(BaseModel):
    id: str
    title: str
    problem_domain: str
    year_start: int | None = None
    year_end: int | None = None
    outcome: str | None = None


class CityRef(BaseModel):
    id: str
    name: str
    country: str
    population: int | None = None


class CaseDetailOut(BaseModel):
    id: str
    title: str
    problem_domain: str
    problem_summary: str | None = None
    solution_summary: str | None = None
    outcome: str | None = None
    cost_estimate: str | None = None
    year_start: int | None = None
    year_end: int | None = None
    source_urls: list[str] = []
    full_text: str | None = None
    city: CityRef
