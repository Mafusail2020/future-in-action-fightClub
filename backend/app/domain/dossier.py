"""Deep city dossier — the enormous, cited knowledge base for one city.

Assembled from three layers (see app/research/): hard open data (Wikidata / OSM /
Wikipedia), live web research (Anthropic web_search, real source URLs), and an
LLM synthesis that turns that grounding into a 15-20 section briefing. Every
section carries a confidence tag; every fact and web finding carries its source,
so the depth survives a skeptic probing it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SourceKind = Literal["wikidata", "wikipedia", "osm", "web", "ai"]
Confidence = Literal["high", "medium", "low"]


class CityFact(BaseModel):
    """One hard, verifiable data point (e.g. population, area, mayor)."""

    label: str
    value: str
    source: str  # human label, e.g. "Wikidata"
    url: str | None = None


class DossierSource(BaseModel):
    """A referenceable source behind the dossier (mostly real web/open-data URLs)."""

    id: str  # short label, e.g. "W3"
    title: str
    url: str | None = None
    kind: SourceKind = "web"


class DossierSection(BaseModel):
    """One topical section of the briefing."""

    key: str
    title: str
    body: str
    confidence: Confidence = "medium"
    sourced: bool = False  # grounded in real data vs. AI inference


class Dossier(BaseModel):
    """Everything the assistant knows about a city, structured for the UI."""

    city: str
    country: str
    headline: str | None = None
    facts: list[CityFact] = []
    sections: list[DossierSection] = []
    sources: list[DossierSource] = []
    generated_at: str | None = None

    @property
    def counts(self) -> dict[str, int]:
        return {
            "facts": len(self.facts),
            "sections": len(self.sections),
            "sources": len(self.sources),
        }

    def model_dump_ui(self) -> dict:
        d = self.model_dump(mode="json")
        d["counts"] = self.counts
        return d
