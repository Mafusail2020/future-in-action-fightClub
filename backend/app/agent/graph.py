from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.agent.nodes.classify import classify_intent
from app.agent.nodes.resolve_geo import resolve_geo
from app.agent.nodes.retrieve_problems import retrieve_problems
from app.agent.nodes.retrieve_solutions import retrieve_solutions
from app.agent.nodes.synthesize import synthesize
from app.agent.state import AgentState


def route_after_classify(state: AgentState) -> str:
    return "synthesize" if state.get("intent") == "chitchat" else "retrieve_problems"


def route_after_problems(state: AgentState) -> str:
    # Solutions advice runs THROUGH problems retrieval first: the solutions query
    # gets enriched with actual Zhytomyr facts before searching other cities' cases.
    return "retrieve_solutions" if state.get("intent") == "solutions_advice" else "resolve_geo"


def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("classify_intent", classify_intent)
    graph.add_node("retrieve_problems", retrieve_problems)
    graph.add_node("retrieve_solutions", retrieve_solutions)
    graph.add_node("resolve_geo", resolve_geo)
    graph.add_node("synthesize", synthesize)

    graph.add_edge(START, "classify_intent")
    graph.add_conditional_edges(
        "classify_intent", route_after_classify, ["retrieve_problems", "synthesize"]
    )
    graph.add_conditional_edges(
        "retrieve_problems", route_after_problems, ["retrieve_solutions", "resolve_geo"]
    )
    graph.add_edge("retrieve_solutions", "resolve_geo")
    graph.add_edge("resolve_geo", "synthesize")
    graph.add_edge("synthesize", END)

    return graph.compile(checkpointer=MemorySaver())
