"""Citation validation — fabricated markers stripped, renumbering, feature linking."""

from app.services import citation_service


def test_finalize_strips_fabricated_citations_and_renumbers(monkeypatch):
    monkeypatch.setattr(citation_service.docs_repo, "get_documents_by_ids", lambda ids: [])
    monkeypatch.setattr(citation_service.solutions_repo, "get_cases_by_ids", lambda ids: [])
    monkeypatch.setattr(citation_service.raions_repo, "get_by_ids", lambda ids: [])

    labeled = {
        1: {"id": "metric:krosha:shop_count", "source_type": "metric",
            "content": "shop_count = 42", "metric": "shop_count", "raion_slug": "krosha"},
        2: {"id": "chunk-2", "source_type": "document", "content": "some text",
            "document_id": "doc-9"},
    }
    raw = "Багато магазинів [S2]. Точна кількість: 42 [S1]. Вигадане джерело [S7]."

    answer, citations, actions = citation_service.finalize(raw, labeled, [
        {"type": "point", "label": "shops",
         "geojson": {"type": "FeatureCollection", "features": [
             {"type": "Feature", "geometry": {"type": "Point", "coordinates": [28.6, 50.2]},
              "properties": {"document_id": "doc-9"}},
         ]},
         "citation_ns": []},
    ])

    # [S7] was never retrieved -> stripped; S2 used first -> becomes [1], S1 -> [2]
    assert "[S" not in answer and "[1]" in answer and "[2]" in answer
    assert [c["n"] for c in citations] == [1, 2]
    assert citations[1]["title"].startswith("Показник")
    # the map point linked to doc-9 inherits the citation number of its document
    assert actions[0]["citation_ns"] == [1]
