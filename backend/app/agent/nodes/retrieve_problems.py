from functools import lru_cache

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from app.agent.state import AgentState
from app.agent.tools.geo_lookup import geo_lookup
from app.agent.tools.problems_search import problems_search
from app.agent.tools.raion_stats import raion_stats
from app.agent.utils import collect_items, load_prompt, main_llm


@lru_cache
def _agent():
    return create_react_agent(
        main_llm(),
        [problems_search, raion_stats, geo_lookup],
        prompt=load_prompt("retrieve_problems"),
    )


def retrieve_problems(state: AgentState) -> dict:
    targets = ", ".join(state.get("target_raions") or [])
    task = (
        f"Питання користувача: {state['query']}\n"
        f"Інтент: {state.get('intent', 'problems_qa')}\n"
        f"Цільові райони (slugs): {targets or 'не вказані — шукай по всьому місту'}\n"
        f"Домен: {state.get('problem_domain') or 'не визначено'}"
    )
    result = _agent().invoke(
        {"messages": [HumanMessage(content=task)]},
        config={"recursion_limit": 14},  # ~6 tool rounds, matches the prompt's budget
    )
    return {"retrieved_problems": collect_items(result["messages"])}
