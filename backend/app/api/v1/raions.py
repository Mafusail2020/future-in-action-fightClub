from fastapi import APIRouter, HTTPException

from app.db.repositories.digests import get_current_digest
from app.db.repositories.raions import get_by_slug, list_raions

router = APIRouter(tags=["raions"])


@router.get("/raions")
def raions() -> list[dict]:
    """All city areas with boundaries — the frontend's initial map render."""
    return [
        {
            "id": r["id"],
            "slug": r["slug"],
            "name_uk": r["name_uk"],
            "name_en": r.get("name_en"),
            "centroid": [r.get("centroid_lng"), r.get("centroid_lat")],  # [lng, lat]
            "boundary_geojson": r.get("boundary_geojson"),
            "population": r.get("population"),
            "area_km2": r.get("area_km2"),
        }
        for r in list_raions()
    ]


@router.get("/raions/{slug}/digest")
def raion_digest(slug: str) -> dict:
    raion = get_by_slug(slug)
    if not raion:
        raise HTTPException(404, f"Unknown raion '{slug}'")
    digest = get_current_digest(raion["id"])
    if not digest:
        raise HTTPException(404, f"No digest generated yet for '{slug}'")
    return {
        "slug": slug,
        "name_uk": raion["name_uk"],
        "content": digest["content"],
        "generated_at": digest["generated_at"],
    }
