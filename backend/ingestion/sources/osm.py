"""OpenStreetMap source: shops, amenities and road segments per raion via Overpass.

Fully automatic. Produces per-raion metrics, map features for notable POIs,
and one 'OSM profile' document per raion for the RAG pool.
"""

import math
from collections import Counter

from app.db.repositories.raions import list_raions
from ingestion.common.base_source import RawDoc, Source, SourceOutput
from ingestion.common.overpass import element_center, query

_AMENITIES = ("school", "kindergarten", "pharmacy", "hospital", "clinic", "marketplace")
_AMENITY_LABELS_UK = {
    "school": "школи", "kindergarten": "дитячі садки", "pharmacy": "аптеки",
    "hospital": "лікарні", "clinic": "клініки", "marketplace": "ринки",
}
_MAX_FEATURES_PER_RAION = 25

_POI_QL = """
[out:json][timeout:90];
(
  node(around:{r},{lat},{lng})["shop"];
  node(around:{r},{lat},{lng})["amenity"~"^({amenities})$"];
  way(around:{r},{lat},{lng})["highway"~"^(primary|secondary|tertiary|residential|service)$"];
);
out center tags;
"""


class OsmSource(Source):
    kind = "osm"
    name = "openstreetmap-overpass"

    def fetch(self) -> SourceOutput:
        output = SourceOutput()
        raions = list_raions()
        if not raions:
            print("  ! raions table is empty — run scripts.seed_raions first")
            return output

        for raion in raions:
            slug = raion["slug"]
            area_km2 = float(raion.get("area_km2") or 4.0)
            radius_m = int(min(max(math.sqrt(area_km2 / math.pi), 0.7), 2.0) * 1000)
            ql = _POI_QL.format(
                r=radius_m, lat=raion["centroid_lat"], lng=raion["centroid_lng"],
                amenities="|".join(_AMENITIES),
            )
            try:
                elements = query(ql, cache_key=f"poi_{slug}").get("elements", [])
            except Exception as exc:
                print(f"  ! Overpass failed for {slug}: {exc}")
                continue

            shops, amenity_counts, highway_counts = Counter(), Counter(), Counter()
            poi_features = []
            for el in elements:
                tags = el.get("tags", {})
                if "shop" in tags:
                    shops[tags["shop"]] += 1
                elif tags.get("amenity") in _AMENITIES:
                    amenity_counts[tags["amenity"]] += 1
                    center = element_center(el)
                    name = tags.get("name:uk") or tags.get("name")
                    if center and name and len(poi_features) < _MAX_FEATURES_PER_RAION:
                        poi_features.append({
                            "raion_slug": slug,
                            "feature_type": tags["amenity"],
                            "label": name,
                            "geometry": {"type": "Point",
                                         "coordinates": [center[1], center[0]]},
                            "properties": {"source": "osm"},
                            "doc_ref": len(output.docs),  # the profile doc appended below
                        })
                elif "highway" in tags:
                    highway_counts[tags["highway"]] += 1

            shop_count = sum(shops.values())
            main_roads = sum(highway_counts[h] for h in ("primary", "secondary", "tertiary"))
            output.metrics += [
                {"raion_slug": slug, "metric": "shop_count", "value": shop_count, "unit": "shops"},
                {"raion_slug": slug, "metric": "shop_density_per_km2",
                 "value": round(shop_count / area_km2, 1), "unit": "shops/km2"},
                {"raion_slug": slug, "metric": "road_segments",
                 "value": sum(highway_counts.values()), "unit": "ways"},
                {"raion_slug": slug, "metric": "road_segments_main",
                 "value": main_roads, "unit": "ways"},
                *[{"raion_slug": slug, "metric": f"{a}_count", "value": amenity_counts[a],
                   "unit": "objects"} for a in _AMENITIES],
            ]

            top_shops = ", ".join(f"{k} ({v})" for k, v in shops.most_common(5)) or "немає даних"
            amenity_line = ", ".join(
                f"{_AMENITY_LABELS_UK[a]}: {amenity_counts[a]}" for a in _AMENITIES
            )
            notable = ", ".join(f["label"] for f in poi_features[:10]) or "немає даних"
            content = (
                f"Профіль району {raion['name_uk']} міста Житомир за даними OpenStreetMap.\n\n"
                f"Торгівля: {shop_count} магазинів, щільність "
                f"{round(shop_count / area_km2, 1)} на км². "
                f"Найпоширеніші типи: {top_shops}.\n"
                f"Соціальна інфраструктура — {amenity_line}.\n"
                f"Вулична мережа: {sum(highway_counts.values())} сегментів доріг, "
                f"з них магістральних (primary/secondary/tertiary): {main_roads}.\n"
                f"Помітні об'єкти: {notable}."
            )
            output.docs.append(RawDoc(
                title=f"OSM-профіль району {raion['name_uk']}",
                content=content,
                doc_type="osm_profile",
                category=None,  # multi-topic
                raion_slug=slug,
                url="https://www.openstreetmap.org",
            ))
            output.features += poi_features
            print(f"  {slug}: {shop_count} shops, {sum(amenity_counts.values())} amenities, "
                  f"{sum(highway_counts.values())} road segments")

        return output
