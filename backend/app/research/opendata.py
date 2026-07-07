"""Hard, verifiable open data about a city — Wikidata, Wikipedia, OSM.

Everything here is best-effort and failure-tolerant: any single source that
times out or 404s is skipped, and the whole layer returns whatever it managed to
gather. The API never *depends* on it — it only enriches the dossier.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from app.config import get_settings
from app.domain.dossier import CityFact, DossierSource

# Wikimedia rejects generic User-Agents (403) — a real project URL + contact is required.
_UA = {
    "User-Agent": (
        "CitySolutionsAggregator/0.1 "
        "(https://github.com/Mafusail2020/future-in-action-fightClub; "
        "contact: galinaaksyenova@gmail.com)"
    ),
}
_TIMEOUT = 8.0


@dataclass
class OpenData:
    facts: list[CityFact] = field(default_factory=list)
    sources: list[DossierSource] = field(default_factory=list)
    grounding: str = ""  # prose fed to the LLM synthesis (not shown raw)
    lat: float | None = None
    lng: float | None = None


# --- City resolution (Wikidata-first) ----------------------------------------

_PLACE_WORDS = ("city", "town", "municipalit", "capital", "settlement", "oblast", "raion",
                "urban", "village", "commune", "county seat")


def _resolve_qid(city: str, country: str) -> str | None:
    """Resolve the city to a Wikidata entity id. Searching Wikidata entities is
    far more reliable than Wikipedia full-text search, which happily returns a
    list page ('List of shopping malls in Ukraine') for a plain city query."""
    try:
        data = httpx.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbsearchentities",
                "search": city,
                "language": "en",
                "type": "item",
                "limit": 8,
                "format": "json",
            },
            headers=_UA,
            timeout=_TIMEOUT,
        ).json()
        cands = data.get("search", [])
        cl = country.strip().lower()
        # Prefer a candidate described as a place in the right country.
        for c in cands:
            desc = (c.get("description") or "").lower()
            if cl in desc and any(w in desc for w in _PLACE_WORDS):
                return c["id"]
        for c in cands:
            desc = (c.get("description") or "").lower()
            if cl in desc or any(w in desc for w in _PLACE_WORDS):
                return c["id"]
        return cands[0]["id"] if cands else None
    except Exception:
        return None


def _wiki_summary(title: str) -> str:
    """English Wikipedia extract for a page title (grounding only, best-effort)."""
    try:
        j = httpx.get(
            "https://en.wikipedia.org/api/rest_v1/page/summary/" + title.replace(" ", "_"),
            headers=_UA,
            timeout=_TIMEOUT,
        ).json()
        return j.get("extract") or ""
    except Exception:
        return ""


# --- Wikidata ----------------------------------------------------------------

_PROPS = {
    "P1082": ("Населення", "population"),
    "P2046": ("Площа", "area"),
    "P571": ("Засноване", "inception"),
    "P2044": ("Висота н.р.м.", "elevation"),
    "P856": ("Офіційний сайт", "website"),
}


def _amount(claim: dict) -> str | None:
    try:
        val = claim["mainsnak"]["datavalue"]["value"]
        if isinstance(val, dict) and "amount" in val:
            n = float(val["amount"])
            return f"{int(n):,}".replace(",", " ") if n.is_integer() else str(n)
        if isinstance(val, dict) and "time" in val:
            year = val["time"].lstrip("+")[:4].lstrip("0")  # "+0884-..." -> "884"
            return year or "0"
        return str(val)
    except Exception:
        return None


def _latest(claims: list[dict]) -> dict | None:
    """Pick the claim with the newest point-in-time (P585) qualifier, else the first."""
    dated = []
    for c in claims:
        t = None
        for q in c.get("qualifiers", {}).get("P585", []):
            t = q.get("datavalue", {}).get("value", {}).get("time")
        dated.append((t or "", c))
    dated.sort(key=lambda x: x[0])
    return dated[-1][1] if dated else None


def _resolve_labels(qids: list[str]) -> dict[str, str]:
    if not qids:
        return {}
    try:
        data = httpx.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbgetentities",
                "ids": "|".join(qids[:12]),
                "props": "labels",
                "languages": "uk|en",
                "format": "json",
            },
            headers=_UA,
            timeout=_TIMEOUT,
        ).json()
        out = {}
        for qid, ent in data.get("entities", {}).items():
            labels = ent.get("labels", {})
            lab = labels.get("uk") or labels.get("en")
            if lab:
                out[qid] = lab["value"]
        return out
    except Exception:
        return {}


def _wikidata(qid: str) -> tuple[list[CityFact], float | None, float | None, str | None]:
    """Return (facts, lat, lng, enwiki_title) for a Wikidata city entity."""
    try:
        data = httpx.get(
            f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
            headers=_UA,
            timeout=_TIMEOUT,
        ).json()
        entity = data["entities"][qid]
        claims = entity["claims"]
    except Exception:
        return [], None, None, None

    url = f"https://www.wikidata.org/wiki/{qid}"
    facts: list[CityFact] = []

    # Coordinates (P625) — drives the OSM amenity counts.
    lat = lng = None
    try:
        coord = claims["P625"][0]["mainsnak"]["datavalue"]["value"]
        lat, lng = coord["latitude"], coord["longitude"]
    except Exception:
        pass

    enwiki = None
    try:
        enwiki = entity["sitelinks"]["enwiki"]["title"]
    except Exception:
        pass

    for pid, (label, _key) in _PROPS.items():
        if pid in claims:
            claim = _latest(claims[pid]) or claims[pid][0]
            val = _amount(claim)
            if pid == "P2046" and val:
                val = f"{val} км²"
            elif pid == "P856":
                try:
                    val = claim["mainsnak"]["datavalue"]["value"]
                except Exception:
                    val = None
            if val:
                facts.append(CityFact(label=label, value=str(val), source="Wikidata", url=url))

    # Entity-valued facts need a label lookup (mayor, twin cities).
    target_qids: list[str] = []

    def entity_qid(claim: dict) -> str | None:
        try:
            return claim["mainsnak"]["datavalue"]["value"]["id"]
        except Exception:
            return None

    mayor_q = entity_qid(_latest(claims["P6"]) or claims["P6"][0]) if "P6" in claims else None
    twin_qs = [q for c in claims.get("P190", []) if (q := entity_qid(c))][:8]
    if mayor_q:
        target_qids.append(mayor_q)
    target_qids.extend(twin_qs)
    labels = _resolve_labels(target_qids)

    if mayor_q and labels.get(mayor_q):
        facts.append(CityFact(label="Голова міста", value=labels[mayor_q], source="Wikidata", url=url))
    twins = [labels[q] for q in twin_qs if labels.get(q)]
    if twins:
        facts.append(
            CityFact(label="Міста-побратими", value=", ".join(twins), source="Wikidata", url=url)
        )
    return facts, lat, lng, enwiki


# --- OSM counts (Overpass) ---------------------------------------------------

_OSM_AMENITIES = {
    "school": "Школи",
    "hospital": "Лікарні",
    "university": "Університети",
    "pharmacy": "Аптеки",
    "kindergarten": "Дитсадки",
}


def _osm_counts(lat: float, lng: float) -> list[CityFact]:
    """One Overpass request that counts several amenity types (each `out count`
    emits its own count element, in order)."""
    settings = get_settings()
    box = f"(around:9000,{lat},{lng})"
    items = list(_OSM_AMENITIES.items())
    stmts = "".join(
        f'node["amenity"="{a}"]{box}->.s{i};.s{i} out count;' for i, (a, _) in enumerate(items)
    )
    query = f"[out:json][timeout:25];{stmts}"
    try:
        data = httpx.post(
            settings.overpass_url, data={"data": query}, headers=_UA, timeout=25.0
        ).json()
        counts = [e for e in data.get("elements", []) if e.get("type") == "count"]
        facts: list[CityFact] = []
        for (_, label), el in zip(items, counts):
            total = el.get("tags", {}).get("total")
            if total and int(total) > 0:
                facts.append(
                    CityFact(label=label, value=str(total), source="OpenStreetMap",
                             url="https://www.openstreetmap.org")
                )
        return facts
    except Exception:
        return []


# --- Orchestration -----------------------------------------------------------


def gather_open_data(city: str, country: str, with_osm: bool = True) -> OpenData:
    out = OpenData()
    qid = _resolve_qid(city, country)
    lat = lng = None

    if qid:
        facts, lat, lng, enwiki = _wikidata(qid)
        out.facts.extend(facts)
        if facts:
            out.sources.append(
                DossierSource(
                    id="OD2", title="Wikidata", url=f"https://www.wikidata.org/wiki/{qid}",
                    kind="wikidata"
                )
            )
            out.grounding += "[Wikidata facts] " + "; ".join(
                f"{f.label}: {f.value}" for f in facts
            ) + "\n\n"
        # Wikipedia extract (grounding) via the entity's own sitelink — so it's
        # always the right page, never a stray search hit.
        if enwiki:
            wiki_url = "https://en.wikipedia.org/wiki/" + enwiki.replace(" ", "_")
            out.sources.append(
                DossierSource(id="OD1", title=f"Wikipedia: {enwiki}", url=wiki_url, kind="wikipedia")
            )
            extract = _wiki_summary(enwiki)
            if extract:
                out.grounding += f"[Wikipedia] {extract}\n\n"

    out.lat, out.lng = lat, lng

    if with_osm and lat is not None and lng is not None:
        osm = _osm_counts(lat, lng)
        if osm:
            out.facts.extend(osm)
            out.sources.append(
                DossierSource(id="OD3", title="OpenStreetMap", url="https://www.openstreetmap.org",
                              kind="osm")
            )
            out.grounding += "[OSM counts] " + "; ".join(
                f"{f.label}: {f.value}" for f in osm
            ) + "\n\n"

    return out
