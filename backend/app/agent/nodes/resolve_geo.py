"""Build map actions from retrieved data. Deliberately LLM-free: all geometry
comes from database rows, so the model can never invent coordinates."""

from collections import Counter

from app.agent.state import AgentState
from app.db.repositories import raions as raions_repo

CITY_CENTER = [28.6587, 50.2547]  # [lng, lat]
_MAX_HIGHLIGHTS = 4


def resolve_geo(state: AgentState) -> dict:
    problems = state.get("retrieved_problems") or []

    # Areas to highlight: explicit targets, else the areas the retrieved data points at.
    slugs = list(state.get("target_raions") or [])
    if not slugs:
        id_counts = Counter(i["raion_id"] for i in problems if i.get("raion_id"))
        referenced = {r["id"]: r for r in raions_repo.get_by_ids(list(id_counts))}
        slugs = [
            referenced[rid]["slug"]
            for rid, _ in id_counts.most_common(_MAX_HIGHLIGHTS)
            if rid in referenced
        ]

    boundaries = raions_repo.get_boundaries(slugs)
    actions = [
        {
            "type": "highlight_raion",
            "label": b["name_uk"],
            "geojson": {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": b["boundary_geojson"],
                    "properties": {"slug": b["slug"], "name": b["name_uk"]},
                }],
            },
            "citation_ns": [],
        }
        for b in boundaries
        if b.get("boundary_geojson")
    ]

    # Point features that geo_lookup brought back, grouped by type.
    by_type: dict[str, list[dict]] = {}
    for item in problems:
        if item.get("source_type") == "feature" and item.get("geometry"):
            by_type.setdefault(item.get("feature_type") or "object", []).append(item)
    for feature_type, items in by_type.items():
        actions.append({
            "type": "point",
            "label": feature_type,
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": item["geometry"],
                        "properties": {
                            "label": item.get("label"),
                            "feature_type": feature_type,
                            "source_id": item["id"],
                            "document_id": item.get("document_id"),
                        },
                    }
                    for item in items
                ],
            },
            "citation_ns": [],
        })

    centroids = [
        (b["centroid_lng"], b["centroid_lat"])
        for b in boundaries
        if b.get("centroid_lat") is not None
    ]
    if centroids:
        center = [
            round(sum(c[0] for c in centroids) / len(centroids), 6),
            round(sum(c[1] for c in centroids) / len(centroids), 6),
        ]
        zoom = 14 if len(centroids) == 1 else 13 if len(centroids) <= 3 else 12
    else:
        center, zoom = CITY_CENTER, 12

    return {"map_actions": actions, "viewport": {"center": center, "zoom": zoom}}
