from functools import lru_cache

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from app.agent.state import AgentState
from app.agent.tools.solutions_search import solutions_search
from app.agent.utils import collect_items, load_prompt, main_llm


@lru_cache
def _agent():
    return create_react_agent(
        main_llm(), [solutions_search], prompt=load_prompt("retrieve_solutions")
    )


def retrieve_solutions(state: AgentState) -> dict:
    facts = "\n".join(
        f"- {item['content'][:300]}" for item in (state.get("retrieved_problems") or [])[:6]
    ) or "(окремих фактів не зібрано)"
    task = (
        f"Питання користувача: {state['query']}\n"
        f"Домен: {state.get('problem_domain') or 'не визначено'}\n"
        f"Зібрані факти про ситуацію в Житомирі:\n{facts}"
    )
    try:
        result = _agent().invoke(
            {"messages": [HumanMessage(content=task)]},
            config={"recursion_limit": 10},
        )
        items = collect_items(result["messages"])
    except Exception as exc:
        # Empty solutions DB or transient failure must not kill the whole answer —
        # the synthesizer states that no case data is available yet.
        print(f"retrieve_solutions failed: {exc}")
        items = []
    return {"retrieved_solutions": items}
