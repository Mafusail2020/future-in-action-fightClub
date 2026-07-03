import json

from langchain_core.tools import tool

from app.db.repositories.metrics_features import get_metrics
from app.db.repositories.raions import slug_id_map


@tool
def raion_stats(raion_slug: str | None = None, metric: str | None = None) -> str:
    """Hard numeric indicators (from the metrics table, not RAG).

    Args:
        raion_slug: city area slug, or OMIT for city-wide indicators —
            budget (budget_income_total_*, budget_expense_*), air quality
            (air_quality_aqi, air_temperature), tender stats (tenders_*).
        metric: exact metric name to filter (e.g. 'shop_density_per_km2'), or omit for all.
    Returns JSON with the latest value per metric; each has an "id" usable for citations.
    """
    raion_id = None
    if raion_slug:
        raion_id = slug_id_map().get(raion_slug)
        if not raion_id:
            return json.dumps({"error": f"unknown raion_slug '{raion_slug}'", "items": []})

    latest: dict[str, dict] = {}
    for row in get_metrics(raion_id, metric=metric):  # ordered newest first
        latest.setdefault(row["metric"], row)

    scope = raion_slug or "misto"
    items = [
        {
            "id": f"metric:{scope}:{name}",
            "source_type": "metric",
            "content": f"{name} = {row['value']} {row['unit'] or ''} "
                       f"(станом на {str(row['measured_at'])[:10]})".strip(),
            "raion_slug": raion_slug,
            "metric": name,
        }
        for name, row in latest.items()
    ]
    return json.dumps({"items": items}, ensure_ascii=False, default=str)
