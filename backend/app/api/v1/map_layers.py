"""Precomputed map overlay layers for a city (see app/domain/map_modes.py)."""

import gzip

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.db.repositories.cities import CitiesRepository
from app.db.repositories.map_layers import MapLayersRepository
from app.dependencies import get_cities_repo, get_map_layers_repo
from app.domain.map_modes import MODE_DESCRIPTORS
from app.domain.models import MapLayerResponse, MapModeInfo

_GZIP_MIN_BYTES = 2048

router = APIRouter(prefix="/cities", tags=["map-layers"])


@router.get("/{city_id}/map-modes")
def list_map_modes(
    city_id: str,
    cities: CitiesRepository = Depends(get_cities_repo),
    layers: MapLayersRepository = Depends(get_map_layers_repo),
) -> list[MapModeInfo]:
    if not cities.get(city_id):
        raise HTTPException(status_code=404, detail="City not found")
    infos: list[MapModeInfo] = []
    for row in layers.modes_for_city(city_id):
        descriptor = MODE_DESCRIPTORS.get(row["mode"])
        if not descriptor:  # a row whose mode left the registry
            continue
        infos.append(MapModeInfo(mode=row["mode"], generated_at=row["generated_at"], **descriptor))
    return infos


@router.get("/{city_id}/map-modes/{mode}", response_model=MapLayerResponse)
def get_map_layer(
    city_id: str,
    mode: str,
    request: Request,
    layers: MapLayersRepository = Depends(get_map_layers_repo),
) -> Response:
    if mode not in MODE_DESCRIPTORS:
        raise HTTPException(status_code=404, detail="Unknown map mode")
    row = layers.get(city_id, mode)
    if not row:
        raise HTTPException(status_code=404, detail="No layer for this city and mode")
    payload = MapLayerResponse(
        mode=row["mode"],
        city_id=row["city_id"],
        generated_at=row["generated_at"],
        meta=row.get("meta") or {},
        feature_collection=row["feature_collection"],
    )
    # GeoJSON compresses ~10x. Gzipped here, endpoint-locally, because a global
    # GZipMiddleware would buffer the /chat SSE stream (see main.py).
    body = payload.model_dump_json().encode()
    if len(body) >= _GZIP_MIN_BYTES and "gzip" in request.headers.get("accept-encoding", ""):
        return Response(
            gzip.compress(body, compresslevel=6),
            media_type="application/json",
            headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"},
        )
    return Response(body, media_type="application/json")
