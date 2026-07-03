from langchain_core.messages import AIMessage

from app.agent.state import AgentState
from app.agent.utils import load_prompt, main_llm, msg_text
from app.services.citation_service import finalize


def synthesize(state: AgentState) -> dict:
    items = (state.get("retrieved_problems") or []) + (state.get("retrieved_solutions") or [])
    labeled = {n: item for n, item in enumerate(items, start=1)}

    sources_block = "\n\n".join(
        f"[S{n}] ({item['source_type']}"
        + (f", {item['city']}" if item.get("city") else "")
        + f") {item['content'][:700]}"
        for n, item in labeled.items()
    ) or "(джерел немає)"

    prompt = load_prompt("synthesize").format(
        query=state["query"],
        intent=state.get("intent", "problems_qa"),
        sources=sources_block,
    )
    raw_answer = msg_text(main_llm(temperature=0.2).invoke(prompt))

    answer, citations, map_actions = finalize(
        raw_answer, labeled, state.get("map_actions") or []
    )
    return {
        "answer": answer,
        "citations": citations,
        "map_actions": map_actions,
        "messages": [AIMessage(content=answer)],
    }
