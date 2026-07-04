from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any

# Shared vocabulary with the solutions layer (solution_cases.problem_domain).
CATEGORIES = ("roads", "transport", "commerce", "demographics", "utilities", "safety")


@dataclass
class RawDoc:
    title: str
    content: str
    doc_type: str                       # 'osm_profile','official_doc','article','camera_report','dataset'
    category: str | None = None         # one of CATEGORIES, or None for multi-topic docs
    raion_slug: str | None = None       # None = city-wide
    url: str | None = None
    published_at: date | None = None
    external_id: str | None = None      # stable per-origin id -> idempotent re-ingest
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceOutput:
    docs: list[RawDoc] = field(default_factory=list)
    # dicts: {raion_slug, metric, value, unit?, meta?}
    metrics: list[dict[str, Any]] = field(default_factory=list)
    # dicts: {raion_slug, feature_type, label?, geometry (GeoJSON, [lng,lat]), properties?, doc_ref?}
    # doc_ref = index into `docs`, resolved to document_id by the loader (citation provenance).
    features: list[dict[str, Any]] = field(default_factory=list)


class Source(ABC):
    """One data origin.

    Adding a new origin — including a future auto-scraper — is a new subclass;
    the loader and everything downstream stay untouched.
    """

    kind: str  # sources.kind: 'camera'|'official_doc'|'public_doc'|'news'|'osm'|'manual'
    name: str

    @abstractmethod
    def fetch(self) -> SourceOutput: ...
