from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph.message import add_messages

Intent = Literal["problems_qa", "compare", "solutions_advice", "chitchat"]


class Citation(TypedDict, total=False):
    n: int                      # inline marker number in the answer, [1], [2], ...
    chunk_id: str
    source_type: str            # document | digest | metric | feature | solution_case
    title: str
    url: str | None
    snippet: str
    raion: str | None
    city: str | None
    published_at: str | None


class MapAction(TypedDict, total=False):
    type: Literal["highlight_raion", "point"]
    label: str
    geojson: dict               # GeoJSON FeatureCollection, coordinates [lng, lat]
    citation_ns: list[int]


class AgentState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    query: str
    intent: Intent
    target_raions: list[str]            # raion slugs resolved by the classifier
    problem_domain: str | None
    retrieved_problems: list[dict[str, Any]]
    retrieved_solutions: list[dict[str, Any]]
    citations: list[Citation]
    map_actions: list[MapAction]
    viewport: dict[str, Any]
    answer: str
