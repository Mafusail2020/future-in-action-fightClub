"""Graph routing, tool-result capture and citation validation — no LLM, no network."""

import json

from langchain_core.messages import AIMessage, ToolMessage

from app.agent.graph import route_after_classify, route_after_problems
from app.agent.utils import collect_items
from app.services import citation_service


def test_routing_by_intent():
    assert route_after_classify({"intent": "chitchat"}) == "synthesize"
    assert route_after_classify({"intent": "problems_qa"}) == "retrieve_problems"
    assert route_after_classify({"intent": "compare"}) == "retrieve_problems"
    assert route_after_classify({"intent": "solutions_advice"}) == "retrieve_problems"

    assert route_after_problems({"intent": "solutions_advice"}) == "retrieve_solutions"
    assert route_after_problems({"intent": "compare"}) == "resolve_geo"
    assert route_after_problems({"intent": "problems_qa"}) == "resolve_geo"


def test_collect_items_dedupes_and_ignores_junk():
    messages = [
        AIMessage(content="calling tools"),
        ToolMessage(content=json.dumps({"items": [
            {"id": "a", "source_type": "document", "content": "x"},
            {"id": "b", "source_type": "metric", "content": "y"},
        ]}), tool_call_id="1"),
        ToolMessage(content="not json at all", tool_call_id="2"),
        ToolMessage(content=json.dumps({"items": [
            {"id": "a", "source_type": "document", "content": "duplicate"},
        ]}), tool_call_id="3"),
    ]
    items = collect_items(messages)
    assert [i["id"] for i in items] == ["a", "b"]


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
