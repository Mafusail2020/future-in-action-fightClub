"""Map-director ops: validation rules and SSE interleaving. No network, no DB."""

from fastapi.testclient import TestClient

from app.agent.map_ops import validate_op
from app.agent.pipeline import Agent
from app.dependencies import get_agent
from app.domain.models import CityProfile
from app.main import app

KNOWN = {"c-vienna", "c-tartu"}


# --- validate_op ---------------------------------------------------------------

def test_valid_ops_pass_and_serialize():
    assert validate_op({"op": "zoom_to", "target": "home"}, KNOWN) == {
        "op": "zoom_to", "target": "home",
    }
    connect = validate_op({"op": "connect", "from": "home", "to": "c-vienna"}, KNOWN)
    assert connect == {"op": "connect", "from": "home", "to": "c-vienna"}
    tour = validate_op(
        {"op": "tour", "stops": [{"city_id": "c-tartu", "text": "Дивіться", "hold_s": 2}]},
        KNOWN,
    )
    assert tour is not None and tour["stops"][0]["city_id"] == "c-tartu"


def test_unknown_city_id_dropped():
    assert validate_op({"op": "mark", "city_id": "c-atlantis"}, KNOWN) is None
    assert validate_op({"op": "connect", "from": "c-vienna", "to": "c-atlantis"}, KNOWN) is None
    assert (
        validate_op({"op": "tour", "stops": [{"city_id": "c-atlantis"}]}, KNOWN) is None
    )


def test_malformed_ops_dropped():
    assert validate_op({"op": "teleport"}, KNOWN) is None
    assert validate_op({"op": "callout", "city_id": "c-vienna", "text": ""}, KNOWN) is None
    assert validate_op({"op": "callout", "city_id": "c-vienna", "text": "x" * 500}, KNOWN) is None
    assert validate_op({"op": "tour", "stops": []}, KNOWN) is None
    assert (
        validate_op(
            {"op": "tour", "stops": [{"city_id": "c-vienna"}] * 9}, KNOWN
        )
        is None
    )


# --- pipeline: tool calls reach on_map_op, text still streams --------------------


class FakeToolLLM:
    """Emits two text chunks with a tool call round in between."""

    def stream_with_tools(self, system, messages, tools, on_tool, **kwargs):
        assert tools and tools[0]["name"] == "direct_map"
        yield "Погляньте на "
        on_tool("direct_map", {"op": "callout", "city_id": "c-vienna", "text": "Тут"})
        on_tool("direct_map", {"op": "mark", "city_id": "c-atlantis"})  # invalid, dropped later
        yield "Відень."

    def stream(self, **kwargs):  # pragma: no cover
        raise AssertionError("map mode must use stream_with_tools")


class FakeCitiesRepo:
    def list_with_counts(self):
        return [
            {"id": "c-vienna", "name": "Відень", "country": "Австрія", "solution_count": 1},
        ]


def test_answer_stream_forwards_ops_and_text():
    agent = Agent(llm=FakeToolLLM(), cities=FakeCitiesRepo(), solutions=None)
    profile = CityProfile(city="Zhytomyr", country="Ukraine", problem_domains=[], summary="s")

    received: list[dict] = []
    text = "".join(
        agent.answer_stream("Покажи Відень", profile, [], [], on_map_op=received.append)
    )

    assert text == "Погляньте на Відень."
    assert [op["op"] for op in received] == ["callout", "mark"]  # raw forward; route validates


# --- route: only validated ops become SSE map_op frames ---------------------------


class FakeAgentForRoute:
    cities = FakeCitiesRepo()

    def answer_stream(self, message, profile, matches, history,
                      on_map_op=None, sources_out=None):
        yield "Дивіться. "
        if on_map_op:
            on_map_op({"op": "zoom_to", "target": "c-vienna"})
            on_map_op({"op": "mark", "city_id": "c-atlantis"})  # unknown id -> dropped
        yield "Готово."


def test_route_emits_validated_map_ops():
    app.dependency_overrides[get_agent] = lambda: FakeAgentForRoute()
    try:
        client = TestClient(app)
        response = client.post("/api/v1/chat", json={"message": "show"})
        events = [
            line.split(" ", 1)[1]
            for line in response.text.split("\n")
            if line.startswith("event: ")
        ]
        assert "map_op" in events
        assert events.count("map_op") == 1  # invalid op never reached the wire
        assert events[-1] == "done"
        assert '"zoom_to"' in response.text and "atlantis" not in response.text
    finally:
        app.dependency_overrides.clear()
