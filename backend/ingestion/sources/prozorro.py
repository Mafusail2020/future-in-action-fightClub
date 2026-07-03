"""Prozorro — active public procurement of Zhytomyr as a "problems" signal.

A tender is the city admitting a problem and pricing the fix: road repair
tenders point at bad roads, water-main tenders at failing utilities. The site
search API (POST, paginated) is queried with one keyword set per category and
results are filtered to the city proper by procuringEntity locality.

Search items carry no CPV codes or descriptions, so the category comes from
the query that found the tender, and the (verbose) title is the document body.
"""

from datetime import UTC, datetime
from typing import Any

from ingestion.common import geo, http
from ingestion.common.api_scraper import ApiScraperSource
from ingestion.common.base_source import RawDoc, SourceOutput

SEARCH_URL = "https://prozorro.gov.ua/api/search/tenders"

# category -> search phrase; the query IS the classifier
_QUERIES = {
    "roads": "ремонт доріг Житомир",
    "transport": "тролейбус Житомир",
    "utilities": "водопостачання Житомир",
    "safety": "освітлення вулиць Житомир",
}
_PAGES_PER_QUERY = 2  # 20 items per page
_CITY_MARKERS = ("м. житомир", "місто житомир")


def _is_city(item: dict[str, Any]) -> bool:
    locality = ((item.get("procuringEntity") or {}).get("address") or {}).get("locality", "")
    return locality.strip().lower() in _CITY_MARKERS


class ProzorroSource(ApiScraperSource):
    name = "Prozorro (закупівлі Житомира)"
    cache_key = "prozorro_zhytomyr"
    ttl_hours = 24.0

    def fetch_site(self) -> Any:
        results: dict[str, list[dict[str, Any]]] = {}
        for category, text in _QUERIES.items():
            items: list[dict[str, Any]] = []
            for page in range(1, _PAGES_PER_QUERY + 1):
                data = http.get_json(SEARCH_URL, method="POST",
                                     params={"text": text, "page": page})
                page_items = data.get("data", [])
                items.extend(page_items)
                if len(page_items) < 20:
                    break
            results[category] = items
        return results

    def parse(self, raw: Any) -> SourceOutput:
        docs: list[RawDoc] = []
        metrics: list[dict[str, Any]] = []
        seen: set[str] = set()

        for category, items in raw.items():
            city_items = [i for i in items if _is_city(i) and i.get("tenderID")]
            count, total_uah = 0, 0.0

            for item in city_items:
                tender_id = item["tenderID"]
                if tender_id in seen:
                    continue
                seen.add(tender_id)

                title = item.get("title", "").strip()
                entity = item.get("procuringEntity") or {}
                buyer = entity.get("name", "")
                amount = float((item.get("value") or {}).get("amount") or 0)
                status = item.get("status", "")
                end_date = ((item.get("tenderPeriod") or {}).get("endDate") or "")[:10]

                count += 1
                total_uah += amount
                content = (
                    f"{title}\n\n"
                    f"Тендер Prozorro {tender_id} ({status}).\n"
                    f"Замовник: {buyer}.\n"
                    f"Очікувана вартість: {amount:,.0f} грн.".replace(",", " ")
                    + (f"\nПодача пропозицій до {end_date}." if end_date else "")
                )
                docs.append(RawDoc(
                    title=title[:200],
                    content=content,
                    doc_type="tender",
                    category=category,
                    raion_slug=geo.raion_by_mention(title),
                    url=f"https://prozorro.gov.ua/tender/{tender_id}",
                    published_at=datetime.now(UTC).date(),
                    external_id=tender_id,
                    meta={"amount_uah": amount, "status": status, "buyer": buyer},
                ))

            if count:
                metrics.append({"raion_slug": None, "metric": f"tenders_{category}_count",
                                "value": count, "unit": "шт"})
                metrics.append({"raion_slug": None, "metric": f"tenders_{category}_value",
                                "value": total_uah, "unit": "грн"})

        if not docs:
            print("  ! prozorro: no city tenders matched the queries")
        return SourceOutput(docs=docs, metrics=metrics)
