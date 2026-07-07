"""Deep dossier: orchestration, graceful degrade, endpoints. Offline (no net/DB)."""

from fastapi.testclient import TestClient

from app.dependencies import get_dossier_builder
from app.domain.dossier import CityFact, Dossier, DossierSource
from app.main import app
from app.research.dossier import DossierBuilder
from app.research.opendata import OpenData
from app.research.websearch import WebResearch


class FakeLLM:
    def __init__(self, sections=None, raises=False):
        self._sections = sections if sections is not None else [
            {"key": "identity", "title": "Ідентичність", "body": "Обласний центр.",
             "confidence": "high", "sourced": True},
            {"key": "energy", "title": "Енергетика", "body": "Застаріле теплопостачання.",
             "confidence": "medium", "sourced": False},
        ]
        self._raises = raises

    def structured(self, system, prompt, schema, tool_name="emit", max_tokens=4096, thinking=None):
        if self._raises:
            raise RuntimeError("synthesis boom")
        return {"headline": "Тест-місто", "sections": self._sections}


def _stub_sources(monkeypatch):
    monkeypatch.setattr(
        "app.research.dossier.gather_open_data",
        lambda city, country, with_osm=True: OpenData(
            facts=[CityFact(label="Населення", value="261 197", source="Wikidata",
                            url="https://www.wikidata.org/wiki/Q4115")],
            sources=[DossierSource(id="OD1", title="Wikipedia", url="http://w", kind="wikipedia")],
            grounding="[Wikidata facts] Населення: 261 197",
            lat=50.25, lng=28.65,
        ),
    )
    monkeypatch.setattr(
        "app.research.dossier.research_web",
        lambda city, country, on_progress=None: WebResearch(
            briefing="Бюджет 2024 склав X.",
            sources=[DossierSource(id="W1", title="rada.gov.ua", url="http://r", kind="web")],
        ),
    )


def test_builder_assembles_and_emits_progress(monkeypatch):
    _stub_sources(monkeypatch)
    builder = DossierBuilder(FakeLLM(), rag=None, profiles=None)  # rag=None → ingest skipped

    stages: list[str] = []
    dossier = builder.build("Zhytomyr", "Ukraine", on_progress=lambda s, d: stages.append(s))

    assert dossier.headline == "Тест-місто"
    assert len(dossier.sections) == 2
    assert dossier.sections[0].key == "identity"
    assert dossier.facts[0].value == "261 197"
    # sources are open-data + web combined
    assert {s.id for s in dossier.sources} == {"OD1", "W1"}
    assert dossier.counts == {"facts": 1, "sections": 2, "sources": 2}
    for stage in ("opendata:start", "opendata:done", "synth:start", "synth:done",
                  "ingest:start", "ingest:done"):
        assert stage in stages


def test_builder_degrades_when_synthesis_fails(monkeypatch):
    _stub_sources(monkeypatch)
    builder = DossierBuilder(FakeLLM(raises=True), rag=None, profiles=None)

    dossier = builder.build("Zhytomyr", "Ukraine")
    # Synthesis failed, but hard facts + sources survive — no exception.
    assert dossier.sections == []
    assert dossier.facts[0].label == "Населення"
    assert len(dossier.sources) == 2


def test_get_cached_without_profiles_is_none():
    builder = DossierBuilder(FakeLLM(), rag=None, profiles=None)
    assert builder.get_cached("Zhytomyr", "Ukraine") is None


# --- endpoints ---------------------------------------------------------------


class FakeBuilder:
    """Stands in for DossierBuilder in the API without touching the network."""

    llm = None

    def __init__(self, cached: Dossier | None = None):
        self._cached = cached

    def get_cached(self, city, country):
        return self._cached

    def build(self, city, country, on_progress=None, with_osm=True):
        if on_progress:
            on_progress("opendata:start", {})
            on_progress("synth:done", {"sections": 1})
        return Dossier(
            city=city, country=country, headline="H",
            sections=[], facts=[], sources=[],
        )


def test_get_dossier_returns_null_when_uncached():
    app.dependency_overrides[get_dossier_builder] = lambda: FakeBuilder(cached=None)
    try:
        client = TestClient(app)
        r = client.get("/api/v1/dossier", params={"city": "Zhytomyr", "country": "Ukraine"})
        assert r.status_code == 200
        assert r.json() == {"dossier": None}
    finally:
        app.dependency_overrides.clear()


def test_get_dossier_returns_cached():
    cached = Dossier(city="Zhytomyr", country="Ukraine", headline="Кешовано", sections=[], facts=[])
    app.dependency_overrides[get_dossier_builder] = lambda: FakeBuilder(cached=cached)
    try:
        client = TestClient(app)
        r = client.get("/api/v1/dossier", params={"city": "Zhytomyr", "country": "Ukraine"})
        body = r.json()["dossier"]
        assert body["headline"] == "Кешовано"
        assert body["counts"] == {"facts": 0, "sections": 0, "sources": 0}
    finally:
        app.dependency_overrides.clear()


def test_deep_dive_streams_progress_then_dossier():
    app.dependency_overrides[get_dossier_builder] = lambda: FakeBuilder()
    try:
        client = TestClient(app)
        r = client.post(
            "/api/v1/dossier/deep-dive",
            json={"city": "Zhytomyr", "country": "Ukraine"},
        )
        assert r.status_code == 200
        text = r.text
        assert "event: progress" in text
        assert '"stage": "synth:done"' in text
        assert "event: dossier" in text
        assert "event: done" in text
    finally:
        app.dependency_overrides.clear()
