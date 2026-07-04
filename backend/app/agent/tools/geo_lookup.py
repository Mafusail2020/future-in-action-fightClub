import json

from langchain_core.tools import tool

from app.agent.labels import label_items
from app.db.repositories.metrics_features import get_features
from app.db.repositories.raions import slug_id_map


@tool
def geo_lookup(raion_slug: str, feature_type: str | None = None) -> str:
    """Mapped point objects in one Zhytomyr city area (schools, pharmacies, potholes, cameras...).

    Use when the user asks about specific places or anything that should be shown on the map.
    Args:
        raion_slug: city area slug (required).
        feature_type: e.g. 'school'|'pharmacy'|'hospital'|'marketplace'|'pothole'|'camera', or omit.
    Returns JSON features with geometry; cite each via its "label" (e.g. [S3]).
    """
    raion_id = slug_id_map().get(raion_slug)
    if not raion_id:
        return json.dumps({"error": f"unknown raion_slug '{raion_slug}'", "items": []})

    items = [
        {
            "id": f"feature:{row['id']}",
            "source_type": "feature",
            "content": f"{row['feature_type']}: {row['label'] or 'об’єкт'} ({raion_slug})",
            "feature_type": row["feature_type"],
            "label": row["label"],
            "geometry": row["geometry"],
            "raion_id": row["raion_id"],
            "document_id": row["document_id"],
        }
        for row in get_features(raion_id=raion_id, feature_type=feature_type, limit=40)
    ]
    return json.dumps({"items": label_items(items)}, ensure_ascii=False, default=str)
