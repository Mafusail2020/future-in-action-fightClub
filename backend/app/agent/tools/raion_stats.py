import json

from langchain_core.tools import tool

from app.agent.labels import label_items
from app.db.repositories.metrics_features import get_metrics
from app.db.repositories.raions import slug_id_map


@tool
def raion_stats(raion_slug: str | None = None, metric: str | None = None) -> str:
    """Hard numeric indicators (from the metrics table, not RAG).

    Args:
        raion_slug: city area slug, or omit for CITY-WIDE indicators
                    (budget totals, air quality, tender counts...).
        metric: exact metric name to filter (e.g. 'shop_density_per_km2'), or omit for all.
    Returns JSON with the latest value per metric; cite each via its "label" (e.g. [S3]).
    """
    if raion_slug:
        raion_id = slug_id_map().get(raion_slug)
        if not raion_id:
            return json.dumps({"error": f"unknown raion_slug '{raion_slug}'", "items": []})
        scope = raion_slug
    else:
        raion_id, scope = None, "misto"  # city-wide rows have NULL raion_id

    latest: dict[str, dict] = {}
    for row in get_metrics(raion_id, metric=metric):  # ordered newest first
        latest.setdefault(row["metric"], row)

    items = [
        {
            "id": f"metric:{scope}:{name}",
            "source_type": "metric",
            "content": f"{name} = {row['value']} {row['unit'] or ''} "
                       f"(станом на {str(row['measured_at'])[:10]})".strip(),
            "raion_slug": scope,
            "metric": name,
        }
        for name, row in latest.items()
    ]
    return json.dumps({"items": label_items(items)}, ensure_ascii=False, default=str)
