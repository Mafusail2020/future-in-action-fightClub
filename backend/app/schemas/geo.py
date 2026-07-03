"""Map payload consumed by the frontend.

All GeoJSON coordinates are [lng, lat] (GeoJSON spec order) — Leaflet's L.geoJSON
handles this natively; do NOT swap them manually.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Viewport(BaseModel):
    center: list[float] = Field(description="[lng, lat]")
    zoom: int = 12


class MapActionModel(BaseModel):
    type: Literal["highlight_raion", "point"]
    label: str
    geojson: dict  # GeoJSON FeatureCollection
    citation_ns: list[int] = []


class MapPayload(BaseModel):
    actions: list[MapActionModel] = []
    viewport: Viewport
