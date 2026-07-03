import json

from langchain_core.tools import tool

from app.db.repositories.metrics_features import get_metrics
from app.db.repositories.raions import slug_id_map


@tool
def raion_stats(raion_slug: str, metric: str | None = None) -> str:
    """Hard numeric indicators for one Zhytomyr city area (from the metrics table, not RAG).

    Args:
        raion_slug: city area slug (required).
        metric: exact metric name to filter (e.g. 'shop_density_per_km2'), or omit for all.
    Returns JSON with the latest value per metric; each has an "id" usable for citations.
    """
    raion_id = slug_id_map().get(raion_slug)
    if not raion_id:
        return json.dumps({"error": f"unknown raion_slug '{raion_slug}'", "items": []})

    latest: dict[str, dict] = {}
    for row in get_metrics(raion_id, metric=metric):  # ordered newest first
        latest.setdefault(row["metric"], row)

    items = [
        {
            "id": f"metric:{raion_slug}:{name}",
            "source_type": "metric",
            "content": f"{name} = {row['value']} {row['unit'] or ''} "
                       f"(станом на {str(row['measured_at'])[:10]})".strip(),
            "raion_slug": raion_slug,
            "metric": name,
        }
        for name, row in latest.items()
    ]
    return json.dumps({"items": items}, ensure_ascii=False, default=str)
