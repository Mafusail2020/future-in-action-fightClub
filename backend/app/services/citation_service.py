"""Turn raw [S#] markers into validated, hydrated citations.

The synthesizer sees retrieved items labeled [S1]..[Sn] and may only cite those.
Markers that don't match a retrieved item are stripped — fabricated references
never reach the user. Used markers are renumbered [1]..[k] in order of first use.
"""

import re
from typing import Any

from app.agent.state import Citation, MapAction
from app.db.repositories import documents as docs_repo
from app.db.repositories import raions as raions_repo
from app.db.repositories import solutions as solutions_repo

_MARKER = re.compile(r"\[S(\d+)\]")


def finalize(
    raw_answer: str,
    labeled: dict[int, dict[str, Any]],
    map_actions: list[MapAction],
) -> tuple[str, list[Citation], list[MapAction]]:
    used: list[int] = []
    for match in _MARKER.finditer(raw_answer):
        label = int(match.group(1))
        if label in labeled and label not in used:
            used.append(label)
    n_by_label = {label: n for n, label in enumerate(used, start=1)}

    def _replace(match: re.Match) -> str:
        label = int(match.group(1))
        return f"[{n_by_label[label]}]" if label in n_by_label else ""

    answer = _MARKER.sub(_replace, raw_answer).strip()
    citations = _hydrate([(n_by_label[label], labeled[label]) for label in used])

    # Link map features to citations through document provenance.
    ns_by_doc: dict[str, list[int]] = {}
    for label in used:
        doc_id = labeled[label].get("document_id")
        if doc_id:
            ns_by_doc.setdefault(doc_id, []).append(n_by_label[label])
    for action in map_actions:
        action_ns: set[int] = set()
        for feature in action.get("geojson", {}).get("features", []):
            doc_id = feature.get("properties", {}).get("document_id")
            if doc_id in ns_by_doc:
                feature["properties"]["citation_ns"] = ns_by_doc[doc_id]
                action_ns.update(ns_by_doc[doc_id])
        action["citation_ns"] = sorted(action_ns)

    return answer, citations, map_actions


def _hydrate(entries: list[tuple[int, dict[str, Any]]]) -> list[Citation]:
    doc_ids = {e["document_id"] for _, e in entries
               if e.get("source_type") in ("document", "feature") and e.get("document_id")}
    case_ids = {e["case_id"] for _, e in entries
                if e.get("source_type") == "solution_case" and e.get("case_id")}
    documents = {d["id"]: d for d in docs_repo.get_documents_by_ids(list(doc_ids))}
    cases = {c["id"]: c for c in solutions_repo.get_cases_by_ids(list(case_ids))}

    raion_ids = {e["raion_id"] for _, e in entries if e.get("raion_id")}
    raion_ids |= {d["raion_id"] for d in documents.values() if d.get("raion_id")}
    raion_names = {r["id"]: r["name_uk"] for r in raions_repo.get_by_ids(list(raion_ids))}

    citations: list[Citation] = []
    for n, item in entries:
        source_type = item.get("source_type", "document")
        title, url, published_at, city = "Джерело", None, None, item.get("city")
        raion = raion_names.get(item.get("raion_id"))

        if source_type in ("document", "feature") and item.get("document_id") in documents:
            doc = documents[item["document_id"]]
            title, url, published_at = doc["title"], doc.get("url"), doc.get("published_at")
            raion = raion or raion_names.get(doc.get("raion_id"))
            if source_type == "feature":
                title = f"Об'єкт на мапі: {item.get('label') or item.get('feature_type')} — {title}"
        elif source_type == "feature":
            title = f"Об'єкт на мапі: {item.get('label') or item.get('feature_type')}"
        elif source_type == "digest":
            title = f"Дайджест району {raion}" if raion else "Дайджест району"
        elif source_type == "metric":
            title = f"Показник «{item.get('metric')}» ({item.get('raion_slug')})"
        elif source_type == "solution_case":
            case = cases.get(item.get("case_id"))
            if case:
                city_info = case.get("cities") or {}
                city = city or f"{city_info.get('name')}, {city_info.get('country')}"
                title = case["title"]
                urls = case.get("source_urls") or []
                url = urls[0] if urls else None
            else:
                title = f"Кейс міста {city}" if city else "Кейс іншого міста"

        citations.append(Citation(
            n=n,
            chunk_id=str(item["id"]),
            source_type=source_type,
            title=title,
            url=url,
            snippet=(item.get("content") or "")[:300],
            raion=raion,
            city=city,
            published_at=str(published_at) if published_at else None,
        ))
    return citations
