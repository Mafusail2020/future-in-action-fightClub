"""Shared shapes for citations and map actions (used by services and the API layer)."""

from typing import Literal, TypedDict


class Citation(TypedDict, total=False):
    n: int                      # inline marker number in the answer, [1], [2], ...
    chunk_id: str
    source_type: str            # document | digest | metric | feature | solution_case
    title: str
    url: str | None
    snippet: str
    raion: str | None
    city: str | None
    published_at: str | None


class MapAction(TypedDict, total=False):
    type: Literal["highlight_raion", "point"]
    label: str
    geojson: dict               # GeoJSON FeatureCollection, coordinates [lng, lat]
    citation_ns: list[int]
