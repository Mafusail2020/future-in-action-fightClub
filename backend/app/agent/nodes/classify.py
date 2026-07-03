from typing import Literal

from pydantic import BaseModel, Field

from app.agent.state import AgentState
from app.agent.utils import load_prompt, msg_text, router_llm
from app.db.repositories.raions import list_raions


class Route(BaseModel):
    intent: Literal["problems_qa", "compare", "solutions_advice", "chitchat"]
    target_raions: list[str] = Field(default_factory=list, description="Slugs from the known list")
    problem_domain: Literal[
        "roads", "transport", "commerce", "demographics", "utilities", "safety"
    ] | None = None


def classify_intent(state: AgentState) -> dict:
    raions = list_raions()
    known_slugs = {r["slug"] for r in raions}
    raion_lines = "\n".join(f"- {r['slug']}: {r['name_uk']}" for r in raions) or "(none seeded)"

    history_messages = (state.get("messages") or [])[:-1][-6:]
    history = "\n".join(
        f"{m.type}: {msg_text(m)[:200]}" for m in history_messages
    ) or "(початок розмови)"

    prompt = load_prompt("classify").format(
        raions=raion_lines, history=history, query=state["query"]
    )
    route: Route = router_llm().with_structured_output(Route).invoke(prompt)

    return {
        "intent": route.intent,
        "target_raions": [s for s in route.target_raions if s in known_slugs],
        "problem_domain": route.problem_domain,
    }
