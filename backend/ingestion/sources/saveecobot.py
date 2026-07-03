"""SaveEcoBot — live air quality and meteo for Zhytomyr.

Keyless city endpoint https://www.saveecobot.com/maps/zhytomyr.json returns the
city-level AQI plus meteo/gamma readings (no per-station coordinates), so all
metrics here are city-wide. Attribution to saveecobot.com is required by their
terms — it is embedded in the document text and stored as the doc url.
"""

from datetime import UTC, datetime
from typing import Any

from ingestion.common import http
from ingestion.common.api_scraper import ApiScraperSource
from ingestion.common.base_source import RawDoc, SourceOutput

CITY_URL = "https://www.saveecobot.com/maps/zhytomyr.json"
ATTRIBUTION_URL = "https://www.saveecobot.com/maps/zhytomyr"

# meteo key -> (metric name, unit)
_METEO = {
    "temperature": ("air_temperature", "°C"),
    "humidity": ("air_humidity", "%"),
    "wind_power": ("wind_power", "м/с"),
    "gamma": ("gamma_radiation", "нЗв/год"),
}

_AQI_BANDS = [
    (50, "добра"), (100, "помірна"), (150, "шкідлива для чутливих груп"),
    (200, "шкідлива"), (300, "дуже шкідлива"), (10_000, "небезпечна"),
]


def _aqi_label(aqi: float) -> str:
    return next(label for limit, label in _AQI_BANDS if aqi <= limit)


class SaveEcoBotSource(ApiScraperSource):
    name = "SaveEcoBot"
    cache_key = "saveecobot_zhytomyr"
    ttl_hours = 1.0

    def fetch_site(self) -> Any:
        return http.get_json(CITY_URL)

    def parse(self, raw: Any) -> SourceOutput:
        metrics: list[dict[str, Any]] = []
        lines: list[str] = []

        aqi = raw.get("aqi")
        if isinstance(aqi, (int, float)) and not raw.get("aqi_is_old"):
            metrics.append({"raion_slug": None, "metric": "air_quality_aqi",
                            "value": aqi, "unit": "AQI"})
            lines.append(
                f"Індекс якості повітря (AQI за PM2.5, NowCast US EPA): {aqi} — "
                f"якість повітря {_aqi_label(aqi)} "
                f"(станом на {str(raw.get('aqi_updated_at', ''))[:16].replace('T', ' ')})."
            )

        for key, (metric, unit) in _METEO.items():
            reading = (raw.get("meteo") or {}).get(key) or {}
            value = reading.get("value")
            if isinstance(value, (int, float)) and not reading.get("is_old"):
                metrics.append({"raion_slug": None, "metric": metric,
                                "value": value, "unit": unit})
                lines.append(f"{metric.replace('_', ' ')}: {value} {unit}")

        if not metrics:
            print("  ! SaveEcoBot: payload had no fresh readings")
            return SourceOutput()

        content = (
            "Поточний стан повітря та погоди в Житомирі (все місто, дані SaveEcoBot).\n\n"
            + "\n".join(f"- {line}" for line in lines)
            + f"\n\nДжерело даних: SaveEcoBot, {ATTRIBUTION_URL}"
        )
        doc = RawDoc(
            title="Якість повітря в Житомирі (SaveEcoBot)",
            content=content,
            doc_type="dataset",
            category="utilities",
            url=ATTRIBUTION_URL,
            published_at=datetime.now(UTC).date(),
            external_id="saveecobot-city-summary",
            meta={"attribution": "SaveEcoBot", "aqi": aqi},
        )

        features = []
        lat, lng = raw.get("center_latitude"), raw.get("center_longitude")
        if lat and lng:
            features.append({
                "raion_slug": None,
                "feature_type": "air_quality",
                "label": f"AQI {aqi}" if aqi is not None else "Якість повітря",
                "geometry": {"type": "Point",
                             "coordinates": [float(lng), float(lat)]},  # [lng, lat]
                "properties": {"aqi": aqi, "source": "SaveEcoBot"},
                "doc_ref": 0,
            })

        return SourceOutput(docs=[doc], metrics=metrics, features=features)
